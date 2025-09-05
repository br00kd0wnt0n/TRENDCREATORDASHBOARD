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
        const trendAnalysis = parsed[key] || parsed[trend.hashtag] || parsed[index];
        
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
}