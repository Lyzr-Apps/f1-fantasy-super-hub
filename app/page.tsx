'use client'

import { useState, useEffect } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, TrendingUp, TrendingDown, Lock, Unlock, RefreshCw, AlertCircle } from 'lucide-react'

// TypeScript interfaces from test responses
interface Driver {
  name: string
  team: string
  current_price: number
  predicted_points?: number
  value_score?: number
  reason?: string
  confidence?: number
  predicted_position?: number
  confidence_level?: number
  fantasy_value?: number
  value_change_prediction?: string
}

interface Constructor {
  constructor_name: string
  total_points?: number
  avg_position?: number
  reliability_score?: number
  predicted_avg_position?: number
  fantasy_value?: number
}

interface RecommendedTeam {
  drivers: Driver[]
  total_cost: number
  total_predicted_points: number
  budget_remaining: number
}

interface OrchestratorResponse {
  recommended_team: RecommendedTeam
  locked_drivers_included: string[]
  alternative_picks: Driver[]
  insights: {
    stats_summary: string
    prediction_highlights: string
    news_context: string
  }
  excluded_drivers: Array<{ name: string; reason: string }>
}

interface DriverStat {
  driver_name: string
  driver_number: number
  constructor: string
  avg_qualifying_position: number
  avg_race_position: number
  total_points: number
  podium_finishes: number
  dnf_rate: number
  consistency_score: number
  recent_form: string
}

interface NewsInsight {
  driver_name: string
  headline: string
  impact: string
  confidence: number
  source: string
  date: string
}

interface SyncSummary {
  last_sync_time: string
  changes_detected: number
  drivers_updated: number
  constructors_updated: number
  retired_drivers_removed: number
}

// Agent IDs
const AGENT_IDS = {
  FANTASY_ORCHESTRATOR: '6985975907ec48e3dc90a264',
  STATS_ANALYSIS: '698596c476d4fd436bf4b710',
  PREDICTION_ENGINE: '698596e3ab4bf65a66ad08b1',
  NEWS_CONTEXT: '6985970ce5d25ce3f598cbc9',
  DATA_SYNC: '6985972ea791e6e318b8df89',
}

// 2026 Active F1 Drivers (excluding retired)
const ACTIVE_DRIVERS = [
  { name: 'Max Verstappen', team: 'Red Bull', price: 28.2 },
  { name: 'Lewis Hamilton', team: 'Mercedes', price: 25.6 },
  { name: 'Charles Leclerc', team: 'Ferrari', price: 23.1 },
  { name: 'Sergio Perez', team: 'Red Bull', price: 22.4 },
  { name: 'Lando Norris', team: 'McLaren', price: 21.3 },
  { name: 'Carlos Sainz', team: 'Ferrari', price: 20.5 },
  { name: 'George Russell', team: 'Mercedes', price: 19.8 },
  { name: 'Oscar Piastri', team: 'McLaren', price: 17.9 },
  { name: 'Fernando Alonso', team: 'Aston Martin', price: 16.2 },
  { name: 'Lance Stroll', team: 'Aston Martin', price: 13.4 },
  { name: 'Pierre Gasly', team: 'Alpine', price: 12.8 },
  { name: 'Esteban Ocon', team: 'Alpine', price: 11.9 },
  { name: 'Yuki Tsunoda', team: 'RB', price: 7.8 },
  { name: 'Alex Albon', team: 'Williams', price: 8.4 },
  { name: 'Nico Hulkenberg', team: 'Haas', price: 6.9 },
  { name: 'Oliver Bearman', team: 'Haas', price: 5.2 },
  { name: 'Franco Colapinto', team: 'Williams', price: 5.8 },
  { name: 'Jack Doohan', team: 'Alpine', price: 4.5 },
  { name: 'Theo Pourchaire', team: 'Sauber', price: 4.2 },
  { name: 'Liam Lawson', team: 'RB', price: 5.5 },
]

// Constructors
const CONSTRUCTORS = [
  { name: 'Red Bull', price: 32.0 },
  { name: 'Ferrari', price: 28.5 },
  { name: 'Mercedes', price: 27.0 },
  { name: 'McLaren', price: 24.5 },
  { name: 'Aston Martin', price: 18.0 },
  { name: 'Alpine', price: 15.5 },
  { name: 'Williams', price: 12.0 },
  { name: 'RB', price: 11.5 },
  { name: 'Haas', price: 10.0 },
  { name: 'Sauber', price: 8.5 },
]

type RiskTolerance = 'Conservative' | 'Balanced' | 'Aggressive'

export default function Home() {
  // State
  const [activeTab, setActiveTab] = useState('dashboard')
  const [budget, setBudget] = useState(100)
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>('Balanced')
  const [lockedDrivers, setLockedDrivers] = useState<Set<string>>(new Set())
  const [lockedConstructors, setLockedConstructors] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Agent responses
  const [recommendations, setRecommendations] = useState<OrchestratorResponse | null>(null)
  const [driverStats, setDriverStats] = useState<DriverStat[]>([])
  const [newsInsights, setNewsInsights] = useState<NewsInsight[]>([])
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null)

  // Calculate used budget from locked items
  const usedBudget = Array.from(lockedDrivers).reduce((sum, name) => {
    const driver = ACTIVE_DRIVERS.find(d => d.name === name)
    return sum + (driver?.price || 0)
  }, 0) + Array.from(lockedConstructors).reduce((sum, name) => {
    const constructor = CONSTRUCTORS.find(c => c.name === name)
    return sum + (constructor?.price || 0)
  }, 0)

  const remainingBudget = budget - usedBudget

  // Toggle driver lock
  const toggleDriverLock = (driverName: string) => {
    setLockedDrivers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(driverName)) {
        newSet.delete(driverName)
      } else {
        newSet.add(driverName)
      }
      return newSet
    })
  }

  // Toggle constructor lock
  const toggleConstructorLock = (constructorName: string) => {
    setLockedConstructors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(constructorName)) {
        newSet.delete(constructorName)
      } else {
        newSet.add(constructorName)
      }
      return newSet
    })
  }

  // Generate recommendations
  const generateRecommendations = async () => {
    setLoading(true)
    setError(null)

    try {
      const lockedDriversList = Array.from(lockedDrivers).join(', ')
      const message = `Generate F1 fantasy team recommendations for the upcoming race. Budget: $${budget}M. ${lockedDriversList ? `Locked drivers: ${lockedDriversList}.` : ''} Risk tolerance: ${riskTolerance}. Exclude retired drivers.`

      const result = await callAIAgent(message, AGENT_IDS.FANTASY_ORCHESTRATOR)

      if (result.success && result.response.status === 'success') {
        setRecommendations(result.response.result as OrchestratorResponse)
      } else {
        setError(result.error || 'Failed to generate recommendations')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Sync data
  const syncData = async () => {
    setLoading(true)
    setError(null)

    try {
      const message = 'Check for 2026 F1 driver roster changes. Identify any retired drivers who should be removed from active lists. Update fantasy values for all active drivers.'
      const result = await callAIAgent(message, AGENT_IDS.DATA_SYNC)

      if (result.success && result.response.status === 'success') {
        setSyncSummary(result.response.result.sync_summary)
      } else {
        setError(result.error || 'Failed to sync data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Load stats
  const loadStats = async () => {
    setLoading(true)
    setError(null)

    try {
      const message = 'Analyze historical performance for all F1 drivers over the last 5 races. Include qualifying positions, race results, points scored, and DNF rates.'
      const result = await callAIAgent(message, AGENT_IDS.STATS_ANALYSIS)

      if (result.success && result.response.status === 'success') {
        setDriverStats(result.response.result.driver_stats || [])
      } else {
        setError(result.error || 'Failed to load stats')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Load news
  const loadNews = async () => {
    setLoading(true)
    setError(null)

    try {
      const message = 'Analyze recent F1 news, contract rumors, and social media sentiment. Include F2 performance analysis for any rookie drivers joining in 2026.'
      const result = await callAIAgent(message, AGENT_IDS.NEWS_CONTEXT)

      if (result.success && result.response.status === 'success') {
        setNewsInsights(result.response.result.news_insights || [])
      } else {
        setError(result.error || 'Failed to load news')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">F1 Fantasy Team Analyzer Pro</h1>
          <p className="text-sm text-gray-400">Multi-agent AI-powered fantasy team optimization</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-gray-900">
            <TabsTrigger value="dashboard" className="text-white data-[state=active]:bg-green-600">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="predictions" className="text-white data-[state=active]:bg-green-600">
              Predictions
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-white data-[state=active]:bg-green-600">
              Stats
            </TabsTrigger>
            <TabsTrigger value="data" className="text-white data-[state=active]:bg-green-600">
              Data Sync
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left + Center: Team Builder */}
              <div className="lg:col-span-2 space-y-6">
                {/* Budget Meter */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white">Budget</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Used: ${usedBudget.toFixed(1)}M</span>
                        <span className="text-green-500 font-bold">Remaining: ${remainingBudget.toFixed(1)}M</span>
                        <span className="text-gray-400">Total: ${budget.toFixed(1)}M</span>
                      </div>
                      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 transition-all duration-300"
                          style={{ width: `${(usedBudget / budget) * 100}%` }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                          className="bg-gray-800 border-gray-700 text-white"
                          min="50"
                          max="200"
                        />
                        <Label className="text-gray-400 self-center">M</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Risk Tolerance Selector */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white">Risk Tolerance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      {(['Conservative', 'Balanced', 'Aggressive'] as RiskTolerance[]).map((risk) => (
                        <Button
                          key={risk}
                          onClick={() => setRiskTolerance(risk)}
                          variant={riskTolerance === risk ? 'default' : 'outline'}
                          className={`flex-1 text-xs py-2 ${
                            riskTolerance === risk
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                          }`}
                        >
                          {risk}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Driver Lock Grid */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white">Drivers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {ACTIVE_DRIVERS.map((driver) => {
                        const isLocked = lockedDrivers.has(driver.name)
                        return (
                          <button
                            key={driver.name}
                            onClick={() => toggleDriverLock(driver.name)}
                            className={`flex items-center justify-between p-3 rounded-lg transition-all min-h-[44px] ${
                              isLocked
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                          >
                            <div className="text-left flex-1">
                              <div className="font-bold text-white text-base">{driver.name}</div>
                              <div className="text-xs text-gray-300">{driver.team} - ${driver.price}M</div>
                            </div>
                            {isLocked ? (
                              <Lock className="h-4 w-4 text-white ml-2 flex-shrink-0" />
                            ) : (
                              <Unlock className="h-4 w-4 text-gray-400 ml-2 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Constructor Lock Section */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-white">Constructors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {CONSTRUCTORS.map((constructor) => {
                        const isLocked = lockedConstructors.has(constructor.name)
                        return (
                          <button
                            key={constructor.name}
                            onClick={() => toggleConstructorLock(constructor.name)}
                            className={`flex items-center justify-between p-3 rounded-lg transition-all min-h-[44px] ${
                              isLocked
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                          >
                            <div className="text-left flex-1">
                              <div className="font-bold text-white text-sm">{constructor.name}</div>
                              <div className="text-xs text-gray-300">${constructor.price}M</div>
                            </div>
                            {isLocked ? (
                              <Lock className="h-4 w-4 text-white ml-2 flex-shrink-0" />
                            ) : (
                              <Unlock className="h-4 w-4 text-gray-400 ml-2 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Generate Button */}
                <Button
                  onClick={generateRecommendations}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-6 text-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating Recommendations...
                    </>
                  ) : (
                    'Generate Recommendations'
                  )}
                </Button>

                {/* Error Display */}
                {error && (
                  <Card className="bg-red-900/20 border-red-800">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="text-red-400">{error}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Recommendations Panel */}
              <div className="lg:col-span-1">
                <Card className="bg-black border-gray-800 sticky top-6">
                  <CardHeader>
                    <CardTitle className="text-white text-xl">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recommendations ? (
                      <div className="space-y-6">
                        {/* Recommended Team */}
                        <div>
                          <h3 className="text-white font-bold text-lg mb-3">Recommended Team</h3>
                          <div className="space-y-3">
                            {recommendations.recommended_team.drivers.map((driver, idx) => (
                              <div key={idx} className="bg-gray-900 p-3 rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <div className="font-bold text-white text-lg">{driver.name}</div>
                                    <div className="text-xs text-gray-400">{driver.team}</div>
                                  </div>
                                  <Badge className="bg-green-600 text-white">
                                    {driver.predicted_points}pts
                                  </Badge>
                                </div>
                                <div className="text-xs text-gray-300 mb-2">{driver.reason}</div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-gray-400">Price: ${driver.current_price}M</span>
                                  <span className="text-green-500">Value: {driver.value_score?.toFixed(2)}</span>
                                  <span className="text-blue-400">{driver.confidence}% confident</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Team Summary */}
                        <div className="bg-gray-900 p-4 rounded-lg">
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Total Cost:</span>
                              <span className="text-white font-bold">${recommendations.recommended_team.total_cost}M</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Predicted Points:</span>
                              <span className="text-green-500 font-bold">{recommendations.recommended_team.total_predicted_points}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Budget Remaining:</span>
                              <span className="text-white font-bold">${recommendations.recommended_team.budget_remaining}M</span>
                            </div>
                          </div>
                        </div>

                        {/* Alternative Picks */}
                        {recommendations.alternative_picks && recommendations.alternative_picks.length > 0 && (
                          <div>
                            <h3 className="text-white font-bold text-base mb-3">Alternative Picks</h3>
                            <div className="space-y-2">
                              {recommendations.alternative_picks.map((driver, idx) => (
                                <div key={idx} className="bg-gray-900 p-3 rounded-lg">
                                  <div className="font-bold text-white text-base">{driver.name}</div>
                                  <div className="text-xs text-gray-400 mb-1">{driver.team} - ${driver.current_price}M</div>
                                  <div className="text-xs text-gray-300">{driver.reason}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Insights */}
                        {recommendations.insights && (
                          <div className="space-y-3">
                            <h3 className="text-white font-bold text-base">Insights</h3>
                            <div className="bg-gray-900 p-3 rounded-lg">
                              <h4 className="text-sm font-semibold text-green-500 mb-1">Stats Summary</h4>
                              <p className="text-xs text-gray-300">{recommendations.insights.stats_summary}</p>
                            </div>
                            <div className="bg-gray-900 p-3 rounded-lg">
                              <h4 className="text-sm font-semibold text-blue-500 mb-1">Predictions</h4>
                              <p className="text-xs text-gray-300">{recommendations.insights.prediction_highlights}</p>
                            </div>
                            <div className="bg-gray-900 p-3 rounded-lg">
                              <h4 className="text-sm font-semibold text-purple-500 mb-1">News Context</h4>
                              <p className="text-xs text-gray-300">{recommendations.insights.news_context}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 py-12">
                        <p className="mb-2">No recommendations yet</p>
                        <p className="text-sm">Configure your team and click Generate</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Predictions Tab */}
          <TabsContent value="predictions" className="mt-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Race Predictions & Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={loadStats} disabled={loading} className="mb-4 bg-green-600 hover:bg-green-700">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load Predictions
                </Button>

                {driverStats.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {driverStats.map((stat, idx) => (
                      <div key={idx} className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-white text-lg">{stat.driver_name}</h3>
                            <p className="text-xs text-gray-400">{stat.constructor}</p>
                          </div>
                          <Badge className="bg-blue-600">{stat.total_points}pts</Badge>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Avg Qual Pos:</span>
                            <span className="text-white">{stat.avg_qualifying_position.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Avg Race Pos:</span>
                            <span className="text-white">{stat.avg_race_position.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Podiums:</span>
                            <span className="text-white">{stat.podium_finishes}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">DNF Rate:</span>
                            <span className="text-white">{(stat.dnf_rate * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Consistency:</span>
                            <span className="text-green-500 font-bold">{stat.consistency_score}/10</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          <p className="text-xs text-gray-300">{stat.recent_form}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">News & Sentiment Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={loadNews} disabled={loading} className="mb-4 bg-green-600 hover:bg-green-700">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load News
                </Button>

                {newsInsights.length > 0 && (
                  <div className="space-y-4">
                    {newsInsights.map((news, idx) => (
                      <div key={idx} className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-white text-base">{news.driver_name}</h3>
                          <Badge
                            className={
                              news.impact === 'positive'
                                ? 'bg-green-600'
                                : news.impact === 'negative'
                                ? 'bg-red-600'
                                : 'bg-gray-600'
                            }
                          >
                            {news.impact}
                          </Badge>
                        </div>
                        <p className="text-white mb-2">{news.headline}</p>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{news.source}</span>
                          <span>{news.date}</span>
                          <span>{news.confidence}% confidence</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Sync Tab */}
          <TabsContent value="data" className="mt-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Data Synchronization</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={syncData}
                  disabled={loading}
                  className="mb-6 bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </Button>

                {syncSummary && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-white mb-1">{syncSummary.changes_detected}</div>
                        <div className="text-xs text-gray-400">Changes Detected</div>
                      </div>
                      <div className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-500 mb-1">{syncSummary.drivers_updated}</div>
                        <div className="text-xs text-gray-400">Drivers Updated</div>
                      </div>
                      <div className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-500 mb-1">{syncSummary.constructors_updated}</div>
                        <div className="text-xs text-gray-400">Constructors Updated</div>
                      </div>
                      <div className="bg-black border border-gray-800 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-red-500 mb-1">{syncSummary.retired_drivers_removed}</div>
                        <div className="text-xs text-gray-400">Retired Drivers Removed</div>
                      </div>
                    </div>

                    <div className="bg-black border border-gray-800 p-4 rounded-lg">
                      <h3 className="font-bold text-white mb-2">Last Sync</h3>
                      <p className="text-sm text-gray-400">
                        {new Date(syncSummary.last_sync_time).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
