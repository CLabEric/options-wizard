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
import { Info, Target, Calendar, CircleDollarSign } from 'lucide-react'

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCurrency(undefined)
              setTargetPrice(undefined)
              setCurrentPrice(undefined)
              setSelectedExpiry(undefined)
              setRecommendedInstrument(undefined)
              setBestBid(undefined)
              setBestAsk(undefined)
            }}
            className="hover:bg-secondary/80"
          >
            Reset
          </Button>
        </div>

        {/* Main Form */}
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

        {/* Results Card */}
        {recommendedInstrument && (
          <div className="mt-8 rounded-xl overflow-hidden border border-border/50 bg-card animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-blue-500/5 p-6">
              <h2 className="text-lg font-medium text-center mb-4">Recommended Trade</h2>
              <div className="text-center space-y-1">
                <div className="text-2xl font-semibold">
                  {selectedCurrency} {formatUSD(parseFloat(recommendedInstrument.split('-')[2]))} {' '}
                  {recommendedInstrument.endsWith('P') ? 'Put' : 'Call'}
                </div>
                <div className="text-muted-foreground">
                  Expires {formatDate(Number(recommendedInstrument.split('-')[1]) / 100)}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
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
          </div>
        )}
      </div>
    </div>
  )
}