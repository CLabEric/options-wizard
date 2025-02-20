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
import { Info } from 'lucide-react'

export default function Home() {
  const [currencies, setCurrencies] = useState<CurrencyResponseSchema[]>([])
  const [selectedCurrency, setSelectedCurrency] = useState<string>()
  const [targetPrice, setTargetPrice] = useState<string>()
  const [currentPrice, setCurrentPrice] = useState<string>()
  const [expiries, setExpiries] = useState<number[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState<number>()
  const [availableInstruments, setAvailableInstruments] = useState<InstrumentPublicResponseSchema[]>([])
  const [recommendedInstrument, setRecommendedInstrument] = useState<string>()
  const [bestBid, setBestBid] = useState<string>()
  const [bestAsk, setBestAsk] = useState<string>()

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
    const findRecommendedInstrument = async () => {
      if (!selectedCurrency || !targetPrice || !selectedExpiry || !currentPrice || !availableInstruments.length) {
        return
      }

      const targetPriceNum = parseFloat(targetPrice)
      const currentPriceNum = parseFloat(currentPrice)
      
      const shouldBuyCall = targetPriceNum > currentPriceNum
      const optionType = shouldBuyCall ? 'C' : 'P'

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

      try {
        const ticker = await fetchTicker({ instrument_name: closest.instrument_name })
        setBestBid(ticker.result.best_bid_price)
        setBestAsk(ticker.result.best_ask_price)
      } catch (error) {
        console.error('Error fetching ticker:', error)
      }
    }

    findRecommendedInstrument()
  }, [selectedCurrency, targetPrice, selectedExpiry, currentPrice, availableInstruments])

  return (
    <div className="min-h-screen flex flex-col items-center pt-12">
      <div className="w-full max-w-md p-6 space-y-8">
		<div className="flex justify-between items-center mb-8">
		<h1 className="text-2xl font-semibold bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">Options Wizard</h1>
		<Button variant="outline" size="sm" onClick={() => {
			setSelectedCurrency(undefined)
			setTargetPrice(undefined)
			setCurrentPrice(undefined)
			setSelectedExpiry(undefined)
			setRecommendedInstrument(undefined)
			setBestBid(undefined)
			setBestAsk(undefined)
			}}>
			Reset
		</Button>
		</div>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Currency</label>
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency.currency} value={currency.currency}>
                    {currency.currency} ({formatUSD(parseFloat(currency.spot_price))})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Target Price</label>
            <Select 
              value={targetPrice} 
              onValueChange={setTargetPrice} 
              disabled={!currentPrice}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target price" />
              </SelectTrigger>
              <SelectContent>
                {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5].map((multiplier) => {
                  const price = currentPrice 
                    ? (parseFloat(currentPrice) * multiplier).toString()
                    : "0"
                  return (
                    <SelectItem key={multiplier} value={price}>
                      {currentPrice ? formatUSD(parseFloat(price)) : '--'}
                    </SelectItem>
                  )})}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Expiry</label>
            <Select 
              value={selectedExpiry?.toString()} 
              onValueChange={(value) => setSelectedExpiry(Number(value))}
              disabled={!selectedCurrency}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select expiry" />
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

        {recommendedInstrument && (
          <div className="mt-12 pt-8 border-t border-border bg-blue-500/5 rounded-lg p-6">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Recommended Trade</h2>
                <p className="text-2xl font-medium">
                  Buy {selectedCurrency} {formatUSD(parseFloat(recommendedInstrument.split('-')[2]))} {' '}
                  {formatDate(Number(recommendedInstrument.split('-')[1]) / 100)} {' '}
                  {recommendedInstrument.endsWith('P') ? 'Put' : 'Call'}
                </p>
              </div>

			  <div className="grid grid-cols-2 gap-4 px-4">
			    <div className="text-center p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors group relative">
				  <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center justify-center gap-1">
				    Best Bid
				    <Info className="w-3 h-3 text-muted-foreground cursor-help" />
				    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
					  Current best selling price
				    </div>
				  </div>
				  <div className="text-lg text-blue-500">{bestBid ? formatUSD(parseFloat(bestBid)) : '--'}</div>
			    </div>
			  <div className="text-center p-4 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors group relative">
				<div className="text-sm font-medium text-muted-foreground mb-1 flex items-center justify-center gap-1">
				Best Ask
				<Info className="w-3 h-3 text-muted-foreground cursor-help" />
				<div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
					Current best buying price
				</div>
				</div>
				<div className="text-lg text-violet-500">{bestAsk ? formatUSD(parseFloat(bestAsk)) : '--'}</div>
			</div>
			</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}