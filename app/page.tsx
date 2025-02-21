'use client'

import React, { useEffect, useState } from 'react'
import fetchAllCurrencies from 'lib/api/fetch-all-currencies'
import fetchInstruments from '@/lib/api/fetch-instruments'
import fetchTicker from '@/lib/api/get-ticker'
import { CurrencyResponseSchema } from 'types/public.get_all_currencies'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import formatUSD from '@/lib/format-usd'
import formatDate from '@/lib/format-date'
import { InstrumentPublicResponseSchema } from '@/types/public.get_instruments'
import { Button } from '@/components/ui/button'
import { Info, Target, Calendar, CircleDollarSign, Layers } from 'lucide-react'

export default function Home() {
  const [currencies, setCurrencies] = useState<CurrencyResponseSchema[]>([])
  const [selectedCurrency, setSelectedCurrency] = useState<string>()
  const [targetPrice, setTargetPrice] = useState<string>()
  const [currentPrice, setCurrentPrice] = useState<string>()
  const [expiries, setExpiries] = useState<number[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState<number>()
  const [availableInstruments, setAvailableInstruments] = useState<InstrumentPublicResponseSchema[]>([])
  const [strategyType, setStrategyType] = useState<'single' | 'spread'>('single')
  const [recommendedInstrument, setRecommendedInstrument] = useState<string>()
  const [recommendedSpread, setRecommendedSpread] = useState<{
    longLeg: string;
    shortLeg: string;
    type: 'bull-call' | 'bear-put';
    longLegBid?: string;
    longLegAsk?: string;
    shortLegBid?: string;
    shortLegAsk?: string;
  }>()
  const [bestBid, setBestBid] = useState<string>()
  const [bestAsk, setBestAsk] = useState<string>()
  const [isSubmitted, setIsSubmitted] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { result } = await fetchAllCurrencies()
      const filteredResult = result.filter(c => ['BTC', 'ETH'].includes(c.currency))
      setCurrencies(filteredResult)
    }
    fetch()
  }, [])

  useEffect(() => {
    if (selectedCurrency) {
      const currency = currencies.find(c => c.currency === selectedCurrency)
      if (currency) {
        setCurrentPrice(currency.spot_price)
        setTargetPrice(currency.spot_price)
        setSelectedExpiry(undefined)
        setRecommendedInstrument(undefined)
        setBestBid(undefined)
        setBestAsk(undefined)
        
        fetchInstruments({
          currency: selectedCurrency,
          expired: false,
          instrument_type: 'option'
        }).then(({ result }) => {
          setAvailableInstruments(result)
          const uniqueExpiries = [...new Set(result.map(inst => inst.option_details.expiry))]
          setExpiries(uniqueExpiries.sort((a, b) => a - b))
        })
      }
    }
  }, [selectedCurrency, currencies])

  useEffect(() => {
	const findRecommendedTrade = async () => {
		if (!selectedCurrency || !targetPrice || !selectedExpiry || !currentPrice || !availableInstruments.length) {
			return
		}

		const targetPriceNum = parseFloat(targetPrice)
		const currentPriceNum = parseFloat(currentPrice)
		const isBullish = targetPriceNum > currentPriceNum

		if (strategyType === 'single') {
		const optionType = isBullish ? 'C' : 'P'
		const validInstruments = availableInstruments.filter(
			inst => inst.option_details.expiry === selectedExpiry && 
					inst.option_details.option_type === optionType
		)

		if (!validInstruments.length) return

		const closest = validInstruments.reduce((prev, curr) => {
			const prevDiff = Math.abs(parseFloat(prev.option_details.strike) - targetPriceNum)
			const currDiff = Math.abs(parseFloat(curr.option_details.strike) - targetPriceNum)
			return currDiff < prevDiff ? curr : prev
		})

		setRecommendedInstrument(closest.instrument_name)
		setRecommendedSpread(undefined)

		try {
			const ticker = await fetchTicker({ instrument_name: closest.instrument_name })
			setBestBid(ticker.result.best_bid_price)
			setBestAsk(ticker.result.best_ask_price)
		} catch (error) {
			console.error('Error fetching ticker:', error)
		}
		} else {
		// For vertical spreads
		const optionType = isBullish ? 'C' : 'P'
		const spreadType = isBullish ? 'bull-call' : 'bear-put'
		
		const validInstruments = availableInstruments.filter(
			inst => inst.option_details.expiry === selectedExpiry && 
					inst.option_details.option_type === optionType
		).sort((a, b) => 
			parseFloat(a.option_details.strike) - parseFloat(b.option_details.strike)
		)

		if (validInstruments.length < 2) return

		// Find strikes around the target price
		const longLegIndex = validInstruments.findIndex(
			inst => parseFloat(inst.option_details.strike) > currentPriceNum
		)

		if (longLegIndex === -1 || longLegIndex === 0) return

		const longLeg = isBullish ? 
			validInstruments[longLegIndex] : 
			validInstruments[longLegIndex - 1]
		
		const shortLeg = isBullish ?
			validInstruments[longLegIndex + 1] :
			validInstruments[longLegIndex - 2]

		if (!longLeg || !shortLeg) return

		setRecommendedInstrument(undefined)
		setBestBid(undefined)
		setBestAsk(undefined)

		try {
			const [longTicker, shortTicker] = await Promise.all([
			fetchTicker({ instrument_name: longLeg.instrument_name }),
			fetchTicker({ instrument_name: shortLeg.instrument_name })
			])

			setRecommendedSpread({
			type: spreadType,
			longLeg: longLeg.instrument_name,
			shortLeg: shortLeg.instrument_name,
			longLegBid: longTicker.result.best_bid_price,
			longLegAsk: longTicker.result.best_ask_price,
			shortLegBid: shortTicker.result.best_bid_price,
			shortLegAsk: shortTicker.result.best_ask_price
			})
		} catch (error) {
			console.error('Error fetching spread tickers:', error)
		}
		}
	}

	findRecommendedTrade()
  }, [selectedCurrency, targetPrice, selectedExpiry, currentPrice, availableInstruments, strategyType])

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-semibold bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
              Options Wizard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Find the perfect options trade based on your price target
            </p>
          </div>
        </div>

        {!isSubmitted ? (
          <div className={`transition-all duration-700 ease-in-out delay-100 ${
			isSubmitted ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
		}`}>
            {/* Selection Form */}
            <div className="space-y-8 bg-card rounded-xl p-6 shadow-lg border border-border/50">
              {/* Currency Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CircleDollarSign className="w-4 h-4 text-blue-500" /> 
                  Select Currency
                </label>
                <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a currency to trade" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem 
                        key={currency.currency} 
                        value={currency.currency}
                        className="flex items-center justify-between"
                      >
                        <span className="font-medium">{currency.currency}</span>
                        <span className="text-muted-foreground ml-2">
                          {formatUSD(parseFloat(currency.spot_price))}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-500" />
                  Strategy Type
                </label>
                <Select value={strategyType} onValueChange={(value) => setStrategyType(value as 'single' | 'spread')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose strategy type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Option</SelectItem>
                    <SelectItem value="spread">Vertical Spread</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Target Price */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4 text-violet-500" />
                  Target Price
                </label>
                <Select 
                  value={targetPrice} 
                  onValueChange={setTargetPrice} 
                  disabled={!currentPrice}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select your price target" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5].map((multiplier) => {
                      const price = currentPrice 
                        ? (parseFloat(currentPrice) * multiplier).toString()
                        : "0"
                      return (
                        <SelectItem key={multiplier} value={price}>
                          <div className="flex items-center justify-between w-full">
                            <span>{formatUSD(parseFloat(price))}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {multiplier > 1 ? '+' : ''}
                              {((multiplier - 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Expiry Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  Expiry Date
                </label>
                <Select 
                  value={selectedExpiry?.toString()} 
                  onValueChange={(value) => setSelectedExpiry(Number(value))}
                  disabled={!selectedCurrency}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose expiration date" />
                  </SelectTrigger>
                  <SelectContent>
                    {expiries.map((expiry) => (
                      <SelectItem key={expiry} value={expiry.toString()}>
                        {formatDate(expiry)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6 flex justify-center">
              <Button
                disabled={!selectedCurrency || !targetPrice || !selectedExpiry}
                onClick={() => setIsSubmitted(true)}
                className="w-full"
              >
                Get Recommendation
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <div className="bg-card rounded-xl overflow-hidden border border-border/50">
              <div className="bg-blue-500/5 p-6">
                <h2 className="text-lg font-medium text-center mb-4">Recommended Trade</h2>
                
				<div className="text-center text-sm text-muted-foreground mb-6">
				<p>Based on your prediction that {selectedCurrency} will{' '}
					{parseFloat(targetPrice!) > parseFloat(currentPrice!) ? 'rise to' : 'fall to'}{' '}
					{formatUSD(parseFloat(targetPrice!))} by {formatDate(selectedExpiry!)}</p>
				</div>

                {/* Single Option Display */}
				{recommendedInstrument && (
				<>
					{(!bestAsk || bestAsk === '0')? (
					<div className="text-center text-muted-foreground p-4">
						No market is currently available for this option.
					</div>
					) : (
						<>
							<div className="text-center space-y-1">
							<div className="text-2xl font-semibold">
								{selectedCurrency} {formatUSD(parseFloat(recommendedInstrument.split('-')[2]))} {' '}
								{recommendedInstrument.endsWith('P') ? 'Put' : 'Call'}
							</div>
							<div className="text-muted-foreground">
								Expires {formatDate(Number(recommendedInstrument.split('-')[1]) / 100)}
							</div>
							</div>
							
							<div className="grid grid-cols-2 divide-x divide-border border-t border-border mt-6">
							<div className="p-6 text-center group relative">
								<div className="text-sm font-medium text-muted-foreground mb-2 flex items-center justify-center gap-1">
								Best Bid
								<Info className="w-3 h-3 cursor-help" />
								<div className="absolute invisible group-hover:visible bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg">
									Current best selling price
								</div>
								</div>
								<div className="text-xl font-medium text-blue-500">
								{bestBid ? formatUSD(parseFloat(bestBid)) : '--'}
								</div>
							</div>
							
							<div className="p-6 text-center group relative">
								<div className="text-sm font-medium text-muted-foreground mb-2 flex items-center justify-center gap-1">
								Best Ask
								<Info className="w-3 h-3 cursor-help" />
								<div className="absolute invisible group-hover:visible bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg">
									Current best buying price
								</div>
								</div>
								<div className="text-xl font-medium text-violet-500">
								{bestAsk ? formatUSD(parseFloat(bestAsk)) : '--'}
								</div>
							</div>
							</div>

							{/* Risk/Reward Section */}
							<div className="mt-4 p-4 border-t border-border space-y-3">
							<div className="flex justify-between items-center text-sm">
								<span className="font-medium text-red-500">Max Loss</span>
								<span>
								{bestAsk ? formatUSD(parseFloat(bestAsk)) : 'No market available'}
								</span>
							</div>
							<div className="flex justify-between items-center text-sm">
								<span className="font-medium text-green-500">Max Gain</span>
								<span>
								{recommendedInstrument.endsWith('P') ? 
									(bestAsk ? formatUSD(parseFloat(recommendedInstrument.split('-')[2])) : 'No market available') :
									'Unlimited'}
								</span>
							</div>
							</div>
						</>
					)}
				</>
				)}

                {/* Spread Display */}
				{recommendedSpread && (
				<>
					{(!recommendedSpread.longLegAsk || recommendedSpread.longLegAsk === '0' )|| (!recommendedSpread.shortLegBid || recommendedSpread.shortLegBid === '0')? (
					<div className="text-center text-muted-foreground p-4">
						No market is currently available for this spread strategy.
					</div>
					) : (
						<>
							<div className="text-center space-y-1">
							<div className="text-2xl font-semibold">
								{recommendedSpread.type === 'bull-call' ? 'Bull Call Spread' : 'Bear Put Spread'}
							</div>
							<div className="text-muted-foreground">
								Expires {formatDate(Number(recommendedSpread.longLeg.split('-')[1]) / 100)}
							</div>
							</div>

							<div className="mt-6 space-y-4">
							{/* Long Leg */}
							<div className="p-4 bg-secondary/30 rounded-lg">
								<div className="text-sm font-medium mb-2">Long {recommendedSpread.longLeg.endsWith('P') ? 'Put' : 'Call'}</div>
								<div className="flex justify-between text-sm">
								<div>Strike: {formatUSD(parseFloat(recommendedSpread.longLeg.split('-')[2]))}</div>
								<div className="space-x-4">
									<span>Bid: {recommendedSpread.longLegBid ? formatUSD(parseFloat(recommendedSpread.longLegBid)) : '--'}</span>
									<span>Ask: {recommendedSpread.longLegAsk ? formatUSD(parseFloat(recommendedSpread.longLegAsk)) : '--'}</span>
								</div>
								</div>
							</div>

							{/* Short Leg */}
							<div className="p-4 bg-secondary/30 rounded-lg">
								<div className="text-sm font-medium mb-2">Short {recommendedSpread.shortLeg.endsWith('P') ? 'Put' : 'Call'}</div>
								<div className="flex justify-between text-sm">
								<div>Strike: {formatUSD(parseFloat(recommendedSpread.shortLeg.split('-')[2]))}</div>
								<div className="space-x-4">
									<span>Bid: {recommendedSpread.shortLegBid ? formatUSD(parseFloat(recommendedSpread.shortLegBid)) : '--'}</span>
									<span>Ask: {recommendedSpread.shortLegAsk ? formatUSD(parseFloat(recommendedSpread.shortLegAsk)) : '--'}</span>
								</div>
								</div>
							</div>

							{/* Net Credit/Debit */}
							<div className="mt-4 p-4 border-t border-border">
								<div className="flex justify-between items-center">
								<span className="text-sm font-medium">Net {recommendedSpread.type === 'bull-call' ? 'Debit' : 'Credit'}</span>
								<span className="text-lg font-semibold">
									{recommendedSpread.longLegAsk && recommendedSpread.shortLegBid
									? formatUSD(Math.abs(
										parseFloat(recommendedSpread.longLegAsk) - parseFloat(recommendedSpread.shortLegBid)))
									: '--'}
								</span>
								</div>
							</div>

							{/* Risk/Reward Section */}
							<div className="mt-4 space-y-3">
								<div className="flex justify-between items-center text-sm">
								<span className="font-medium text-red-500">Max Loss</span>
								<span>
									{(recommendedSpread.longLegAsk && recommendedSpread.shortLegBid) ?
									formatUSD(Math.abs(
										parseFloat(recommendedSpread.longLegAsk) - parseFloat(recommendedSpread.shortLegBid)
									)) :
									'No market available'}
								</span>
								</div>
								<div className="flex justify-between items-center text-sm">
								<span className="font-medium text-green-500">Max Gain</span>
								<span>
									{(recommendedSpread.longLegAsk && recommendedSpread.shortLegBid) ?
									formatUSD(
										Math.abs(
										parseFloat(recommendedSpread.shortLeg.split('-')[2]) - 
										parseFloat(recommendedSpread.longLeg.split('-')[2])
										) - 
										Math.abs(
										parseFloat(recommendedSpread.longLegAsk) - 
										parseFloat(recommendedSpread.shortLegBid)
										)
									) :
									'No market available'}
								</span>
								</div>
							</div>
							</div>
						</>
					)}
				</>
				)}
              </div>
            </div>

            {/* New Trade Button */}
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() => {
                  setIsSubmitted(false)
                  setSelectedCurrency(undefined)
                  setTargetPrice(undefined)
                  setCurrentPrice(undefined)
                  setSelectedExpiry(undefined)
                  setRecommendedInstrument(undefined)
                  setBestBid(undefined)
                  setBestAsk(undefined)
                }}
                variant="outline"
                className="w-full"
              >
                Get Another Recommendation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}