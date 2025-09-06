import Anthropic from "@anthropic-ai/sdk";
import { AppStats, ProcessInfo } from "./types";

export interface FocusAnalysisResult {
  distractingApps: Array<{
    appName: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  productivityInsights: Array<{
    insight: string;
    category: 'focus' | 'time_management' | 'workflow';
  }>;
  recommendations: Array<{
    action: string;
    benefit: string;
  }>;
}

export interface ResourceAnalysisResult {
  heavyResourceApps: Array<{
    appName: string;
    cpuUsage: number;
    memoryUsage: number;
    impact: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
  }>;
  systemRecommendations: Array<{
    action: string;
    expectedImprovement: string;
  }>;
}

export interface AppCloseRecommendation {
  appName: string;
  reasons: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  expectedBenefit: string;
  safeToClose: boolean;
}

export interface IntegratedAnalysisResult {
  appsToClose: AppCloseRecommendation[];
  overallAssessment: string;
  systemHealthScore: number; // 0-100
}

export class AnalysisService {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * フォーカスアプリの使用パターンを分析
   */
  async analyzeFocusPatterns(focusStats: AppStats[]): Promise<FocusAnalysisResult> {
    const systemPrompt = `あなたは生産性分析の専門家です。ユーザーのアプリ使用統計を分析して、集中力を妨げるアプリや改善点を特定してください。

以下の観点から分析してください：
1. 短時間で頻繁に切り替わるアプリ（集中力散漫の指標）
2. 長時間使用されているが生産性に疑問があるアプリ
3. 使用パターンから見える問題点
4. 改善のための具体的な提案

回答は日本語で行い、実用的で納得感のあるアドバイスを提供してください。`;

    const userMessage = `アプリ使用統計データ：
${focusStats.map(stat => 
  `- ${stat.appName}: 総使用時間${Math.round(stat.totalFocusTime/60)}分, セッション数${stat.totalSessions}, 平均セッション${Math.round(stat.averageSessionTime/60)}分`
).join('\n')}

この使用パターンを分析して、集中力を妨げるアプリと改善提案を教えてください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "focus_analysis",
          description: "フォーカス分析結果を提供",
          input_schema: {
            type: "object",
            properties: {
              distractingApps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    appName: { type: "string" },
                    reason: { type: "string" },
                    severity: { type: "string", enum: ["high", "medium", "low"] }
                  },
                  required: ["appName", "reason", "severity"]
                }
              },
              productivityInsights: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    insight: { type: "string" },
                    category: { type: "string", enum: ["focus", "time_management", "workflow"] }
                  },
                  required: ["insight", "category"]
                }
              },
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    benefit: { type: "string" }
                  },
                  required: ["action", "benefit"]
                }
              }
            },
            required: ["distractingApps", "productivityInsights", "recommendations"]
          }
        }],
        tool_choice: { type: "tool", name: "focus_analysis" }
      });

      const toolUse = response.content.find(
        (content: any): content is Anthropic.Messages.ToolUseBlock =>
          content.type === "tool_use" && content.name === "focus_analysis"
      );

      if (toolUse && typeof toolUse.input === "object") {
        return toolUse.input as FocusAnalysisResult;
      }

      return {
        distractingApps: [],
        productivityInsights: [],
        recommendations: []
      };
    } catch (error) {
      console.error("Focus analysis error:", error);
      throw error;
    }
  }

  /**
   * CPU・メモリ使用量を分析
   */
  async analyzeResourceUsage(processes: ProcessInfo[]): Promise<ResourceAnalysisResult> {
    const systemPrompt = `あなたはシステムパフォーマンスの専門家です。macOSのプロセス情報を分析して、リソース使用量が多いアプリを特定し、システム最適化の提案を行ってください。

以下の観点から分析してください：
1. CPU使用率が高いプロセス（5%以上は要注意、10%以上は重要）
2. メモリ使用量が多いプロセス（200MB以上は要注意、500MB以上は重要）
3. システムパフォーマンスへの影響度
4. 安全に最適化できる項目

実用的で安全な最適化提案を日本語で提供してください。`;

    const userMessage = `現在のプロセス情報：
${processes.slice(0, 20).map(proc => 
  `- ${proc.name}: CPU ${proc.cpuUsage.toFixed(1)}%, メモリ ${proc.memoryUsage.toFixed(0)}MB${proc.description ? ` (${proc.description})` : ''}`
).join('\n')}

このリソース使用状況を分析して、最適化提案を教えてください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "resource_analysis",
          description: "リソース分析結果を提供",
          input_schema: {
            type: "object",
            properties: {
              heavyResourceApps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    appName: { type: "string" },
                    cpuUsage: { type: "number" },
                    memoryUsage: { type: "number" },
                    impact: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    reason: { type: "string" }
                  },
                  required: ["appName", "cpuUsage", "memoryUsage", "impact", "reason"]
                }
              },
              systemRecommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    expectedImprovement: { type: "string" }
                  },
                  required: ["action", "expectedImprovement"]
                }
              }
            },
            required: ["heavyResourceApps", "systemRecommendations"]
          }
        }],
        tool_choice: { type: "tool", name: "resource_analysis" }
      });

      const toolUse = response.content.find(
        (content: any): content is Anthropic.Messages.ToolUseBlock =>
          content.type === "tool_use" && content.name === "resource_analysis"
      );

      if (toolUse && typeof toolUse.input === "object") {
        return toolUse.input as ResourceAnalysisResult;
      }

      return {
        heavyResourceApps: [],
        systemRecommendations: []
      };
    } catch (error) {
      console.error("Resource analysis error:", error);
      throw error;
    }
  }

  /**
   * フォーカス分析とリソース分析を統合して、閉じるべきアプリを提案
   */
  async getIntegratedRecommendations(
    focusAnalysis: FocusAnalysisResult,
    resourceAnalysis: ResourceAnalysisResult,
    currentApps: string[]
  ): Promise<IntegratedAnalysisResult> {
    const systemPrompt = `あなたは快適なMac環境を実現する専門家です。フォーカス分析とリソース分析の結果を統合して、実際に閉じるべきアプリを特定してください。

重要な判断基準：
1. システムの安定性を最優先（重要なシステムプロセスは除外）
2. ユーザーの作業効率への影響を考慮
3. 閉じても安全で、実際に効果があるアプリのみを推奨
4. 納得感のある明確な理由を提示

目標：「快適なMac生活」のための実用的で安全な提案を日本語で行う。`;

    const userMessage = `フォーカス分析結果：
集中力を妨げるアプリ：
${focusAnalysis.distractingApps.map(app => `- ${app.appName} (${app.severity}): ${app.reason}`).join('\n')}

リソース分析結果：
重いアプリ：
${resourceAnalysis.heavyResourceApps.map(app => `- ${app.appName} (CPU: ${app.cpuUsage}%, RAM: ${app.memoryUsage}MB, ${app.impact}): ${app.reason}`).join('\n')}

現在実行中のアプリ：
${currentApps.join(', ')}

これらの情報を統合して、実際に閉じるべきアプリとその理由を教えてください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [{
          name: "integrated_analysis",
          description: "統合分析結果を提供",
          input_schema: {
            type: "object",
            properties: {
              appsToClose: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    appName: { type: "string" },
                    reasons: { type: "array", items: { type: "string" } },
                    priority: { type: "string", enum: ["urgent", "high", "medium", "low"] },
                    expectedBenefit: { type: "string" },
                    safeToClose: { type: "boolean" }
                  },
                  required: ["appName", "reasons", "priority", "expectedBenefit", "safeToClose"]
                }
              },
              overallAssessment: { type: "string" },
              systemHealthScore: { type: "number", minimum: 0, maximum: 100 }
            },
            required: ["appsToClose", "overallAssessment", "systemHealthScore"]
          }
        }],
        tool_choice: { type: "tool", name: "integrated_analysis" }
      });

      const toolUse = response.content.find(
        (content: any): content is Anthropic.Messages.ToolUseBlock =>
          content.type === "tool_use" && content.name === "integrated_analysis"
      );

      if (toolUse && typeof toolUse.input === "object") {
        const result = toolUse.input as any;
        // 型安全性を確保
        return {
          appsToClose: Array.isArray(result.appsToClose) ? result.appsToClose : [],
          overallAssessment: typeof result.overallAssessment === "string" ? result.overallAssessment : "分析結果を取得できませんでした",
          systemHealthScore: typeof result.systemHealthScore === "number" ? result.systemHealthScore : 50
        };
      }

      return {
        appsToClose: [],
        overallAssessment: "分析を完了できませんでした",
        systemHealthScore: 50
      };
    } catch (error) {
      console.error("Integrated analysis error:", error);
      throw error;
    }
  }
}