import { Anthropic } from '@anthropic-ai/sdk';
import { TrendData, AIAnalysis } from '../types';
import { logger } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

export class AIEnrichmentService {
  private anthropic: Anthropic;
  private model = 'claude-3-5-sonnet-20240620';

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  async analyzeTrends(trends: TrendData[]): Promise<Map<string, AIAnalysis>> {
    const analyses = new Map<string, AIAnalysis>();

    try {
      const prompt = this.buildAnalysisPrompt(trends);
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const parsedAnalyses = this.parseAIResponse(content.text, trends);
        parsedAnalyses.forEach((analysis, trendKey) => {
          analyses.set(trendKey, analysis);
        });
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
    
Analyze these trending topics and provide strategic insights:

${JSON.stringify(trends, null, 2)}

For each trend, provide a structured JSON analysis with:
1. "insights": Deep cultural and market insights (2-3 sentences)
2. "sentiment": Overall sentiment (positive/neutral/negative)
3. "predictedGrowth": Growth trajectory (increasing/stable/declining)
4. "businessOpportunities": Array of 2-3 specific business opportunities
5. "relatedTrends": Array of 2-3 related or complementary trends
6. "confidence": Confidence score (0.0-1.0) in your analysis

Consider:
- Cross-platform trend correlation
- Demographic implications
- Monetization potential
- Content strategy opportunities
- Emerging patterns and weak signals
- Cultural shifts and zeitgeist indicators

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
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.8,
        messages: [{
          role: 'user',
          content: `Generate an executive summary report for these trending topics:
          
${JSON.stringify(trends.slice(0, 10), null, 2)}

Create a compelling narrative that includes:
1. Top 3 emerging opportunities
2. Cross-platform trend patterns
3. Strategic recommendations
4. Risk factors and considerations

Format as a professional report with sections and bullet points.`
        }]
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : 'Report generation failed';
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
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1200,
        temperature: 0.6,
        messages: [{
          role: 'user',
          content: `As a digital culture and trend intelligence expert, analyze these trending hashtags and provide insights about what they reveal:

${JSON.stringify(stats, null, 2)}

Focus primarily on the ACTUAL HASHTAGS and trending content, not on data collection methods. Analyze what these specific trends tell us about:

Generate a JSON response with:
1. "overview": A 2-3 sentence analysis of what the current trending hashtags reveal about digital culture, consumer behavior, or emerging movements
2. "totalTrendsInsight": What the variety and volume of these specific hashtags suggests about current cultural/market dynamics (1-2 sentences)
3. "recentActivityInsight": Analysis of what these particular trends indicate about what's capturing attention right now (1-2 sentences) 
4. "highConfidenceExplanation": Explanation of what makes certain trends more reliable indicators than others, based on their content and platform presence (2 sentences)
5. "keyInsights": Array of exactly 5 bullet points about what these SPECIFIC hashtags and trends reveal about opportunities, cultural shifts, consumer interests, or market movements
6. "question": One thought-provoking question about the trend data that would help users explore deeper insights or implications

Analyze the hashtag content itself - what topics, themes, emotions, or interests do they represent? What do they tell us about what people care about right now?`
        }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
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
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1000,
        temperature: 0.5,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : null;
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