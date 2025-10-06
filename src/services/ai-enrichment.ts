import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { TrendData, AIAnalysis } from '../types';
import { logger } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

export class AIEnrichmentService {
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private provider: 'anthropic' | 'openai';
  private anthropicModel = 'claude-3-5-sonnet-20240620';
  private openaiModel = 'gpt-4o';

  constructor() {
    // Determine which AI provider to use
    this.provider = (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai';

    if (this.provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        logger.error('OPENAI_API_KEY not set, falling back to Anthropic');
        this.provider = 'anthropic';
      } else {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        logger.info('🤖 AI Service initialized with OpenAI (gpt-4o)');
      }
    }

    if (this.provider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || ''
      });
      logger.info('🤖 AI Service initialized with Anthropic (Claude 3.5 Sonnet)');
    }
  }

  private async callAI(prompt: string, maxTokens: number = 2000, temperature: number = 0.7): Promise<string | null> {
    try {
      if (this.provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature
        });
        return response.choices[0]?.message?.content || null;
      } else if (this.provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: this.anthropicModel,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        });
        const content = response.content[0];
        return content.type === 'text' ? content.text : null;
      }
      return null;
    } catch (error) {
      logger.error(`AI call failed (${this.provider}):`, error);
      return null;
    }
  }

  async analyzeTrends(trends: TrendData[]): Promise<Map<string, AIAnalysis>> {
    const analyses = new Map<string, AIAnalysis>();

    try {
      const prompt = this.buildAnalysisPrompt(trends);
      const responseText = await this.callAI(prompt, 2000, 0.7);

      if (responseText) {
        const parsedAnalyses = this.parseAIResponse(responseText, trends);
        parsedAnalyses.forEach((analysis, trendKey) => {
          analyses.set(trendKey, analysis);
        });
      } else {
        throw new Error('AI returned null response');
      }
    } catch (error) {
      logger.error('AI analysis failed:', error);
      trends.forEach(trend => {
        const key = `${trend.hashtag || 'unknown'}_${trend.platform || 'unknown'}`;
        analyses.set(key, this.getDefaultAnalysis(key));
      });
    }

    return analyses;
  }

  private buildAnalysisPrompt(trends: TrendData[]): string {
    return `You are an expert trend analyst specializing in digital culture and business intelligence.
    
Project context: We are curating content for Amazon Prime Video India's new Instagram handle "In Our Prime". The vibe is creator-led, fan-made, not traditional marketing. Target audience: Gen Z and Millennials in India. We care about short-form memeability (Reels/TikTok), cultural transposability, and low context dependence. De-emphasize generic sales/holiday/greeting tags.

Analyze these trending topics and provide strategic insights with this lens:

${JSON.stringify(trends, null, 2)}

For each trend, provide a structured JSON analysis with:
1. "insights": Deep cultural and market insights (2-3 sentences) relevant to the "In Our Prime" creator-led style
2. "sentiment": Overall sentiment (positive/neutral/negative)
3. "predictedGrowth": Growth trajectory (increasing/stable/declining)
4. "businessOpportunities": Array of 2-3 specific creator-led content ideas or programming hooks
5. "relatedTrends": Array of 2-3 related or complementary trends
6. "confidence": Confidence score (0.0-1.0) reflecting crossover fit for "In Our Prime" (IG/TikTok memeability, Indian audience receptivity, recency)

Consider:
- Short-form memeability (remix, template, audio/sound)
- Entertainment/comedy/dance/music/tech culture crossover
- Gen Z/Millennial resonance in India
- Deprioritize generic commerce/holiday/greeting hashtags and outdated year-stamped tags
- Cross-platform signals and recency

Return a JSON object with trend identifiers as keys and analysis objects as values.`;
  }

  private parseAIResponse(response: string, trends: TrendData[]): Map<string, AIAnalysis> {
    const analyses = new Map<string, AIAnalysis>();

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      trends.forEach((trend, index) => {
        const key = `${trend.hashtag || 'unknown'}_${trend.platform || 'unknown'}`;
        const trendAnalysis = parsed[key] || parsed[trend.hashtag || ''] || parsed[index.toString()];
        
        if (trendAnalysis) {
          analyses.set(key, {
            trendId: key,
            insights: trendAnalysis.insights || 'No specific insights available',
            sentiment: trendAnalysis.sentiment || 'neutral',
            predictedGrowth: trendAnalysis.predictedGrowth || 'stable',
            businessOpportunities: trendAnalysis.businessOpportunities || [],
            relatedTrends: trendAnalysis.relatedTrends || [],
            confidence: trendAnalysis.confidence || 0.5
          });
        } else {
          analyses.set(key, this.getDefaultAnalysis(key));
        }
      });
    } catch (error) {
      logger.error('Failed to parse AI response:', error);
      trends.forEach(trend => {
        const key = `${trend.hashtag || 'unknown'}_${trend.platform || 'unknown'}`;
        analyses.set(key, this.getDefaultAnalysis(key));
      });
    }

    return analyses;
  }

  private getDefaultAnalysis(trendId: string): AIAnalysis {
    return {
      trendId,
      insights: 'Analysis pending',
      sentiment: 'neutral',
      predictedGrowth: 'stable',
      businessOpportunities: [],
      relatedTrends: [],
      confidence: 0.3
    };
  }

  async generateTrendReport(trends: any[]): Promise<string> {
    try {
      const prompt = `Generate an executive summary report for these trending topics:

${JSON.stringify(trends.slice(0, 10), null, 2)}

Create a compelling narrative that includes:
1. Top 3 emerging opportunities
2. Cross-platform trend patterns
3. Strategic recommendations
4. Risk factors and considerations

Format as a professional report with sections and bullet points.`;

      const responseText = await this.callAI(prompt, 1500, 0.8);
      return responseText || 'Report generation failed';
    } catch (error) {
      logger.error('Report generation failed:', error);
      return 'Unable to generate trend report at this time';
    }
  }

  /**
   * Generate dashboard narrative with contextual insights
   */
  async generateDashboardNarrative(stats: any): Promise<any> {
    try {
      // Check if we have actual trend data to analyze
      const hasTrendData = stats && (
        (stats.topTrends && stats.topTrends.length > 0) ||
        (stats.trendingContent && stats.trendingContent.length > 0) ||
        (stats.totalTrends && stats.totalTrends > 0)
      );

      if (!hasTrendData) {
        logger.warn('No trend data available for narrative generation');
        return this.getDefaultNarrative();
      }

      logger.info(`Generating narrative for ${stats.totalTrends || 0} trends`);

      const prompt = `As a digital culture and trend intelligence expert, analyze these trending hashtags and provide insights about what they reveal, tuned for Amazon Prime Video India's "In Our Prime" Instagram handle (creator-led, fan-made, not traditional marketing; Gen Z/Millennial audience):

${JSON.stringify(stats, null, 2)}

Focus primarily on the ACTUAL HASHTAGS and trending content, not on data collection methods. Analyze what these specific trends tell us about:

Generate a JSON response with:
1. "overview": A 2-3 sentence analysis of what the current trending hashtags reveal about digital culture, consumer behavior, or emerging movements
2. "totalTrendsInsight": What the variety and volume of these specific hashtags suggests about current cultural/market dynamics (1-2 sentences)
3. "recentActivityInsight": Analysis of what these particular trends indicate about what's capturing attention right now (1-2 sentences)
4. "highConfidenceExplanation": Explanation of what makes certain trends more reliable indicators than others, based on their content and platform presence (2 sentences)
5. "keyInsights": Array of exactly 5 bullet points about what these SPECIFIC hashtags and trends reveal about opportunities, cultural shifts, consumer interests, or market movements
6. "question": One thought-provoking question about the trend data that would help users explore deeper insights or implications

Analyze the hashtag content itself - what topics, themes, emotions, or interests do they represent? What do they tell us about what people care about right now?`;

      const responseText = await this.callAI(prompt, 1200, 0.6);

      if (responseText) {
        logger.info('AI response received, parsing JSON');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          logger.info('Successfully parsed AI narrative');
          return parsed;
        } else {
          logger.warn('No JSON found in AI response:', responseText.substring(0, 200));
        }
      }
      logger.warn('Falling back to default narrative');
      return this.getDefaultNarrative();
    } catch (error) {
      logger.error('Dashboard narrative generation failed:', error);
      return this.getDefaultNarrative();
    }
  }

  /**
   * Analyze raw content to extract trends (for fallback extraction)
   */
  async analyzeContent(prompt: string): Promise<string | null> {
    try {
      return await this.callAI(prompt, 1000, 0.5);
    } catch (error) {
      logger.error('AI content analysis failed:', error);
      return null;
    }
  }

  private getDefaultNarrative(): any {
    return {
      overview: "Trend analysis is currently processing. Fresh insights will be available after the next scraping cycle completes.",
      totalTrendsInsight: "Total trends represent the cumulative intelligence gathered across all monitoring sources.",
      recentActivityInsight: "Recent activity indicates the current pulse of digital culture and emerging opportunities.", 
      highConfidenceExplanation: "High Confidence trends have been validated by AI analysis with strong supporting signals. These represent the most reliable opportunities for immediate action.",
      keyInsights: [
        "Multi-platform trend correlation provides stronger market signals",
        "Real-time monitoring enables rapid response to emerging opportunities",
        "AI-powered sentiment analysis reveals market reception patterns",
        "Cross-demographic trend analysis identifies broader appeal potential",
        "Predictive growth indicators help prioritize investment decisions"
      ],
      question: "What emerging patterns do you see across these trending topics that might signal a larger cultural or market shift?"
    };
  }
}
