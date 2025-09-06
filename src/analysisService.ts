import Anthropic from "@anthropic-ai/sdk";
import { AppStats, ProcessInfo } from "./types";

export interface FocusAnalysisResult {
  distractingApps: Array<{
    appName: string;
    reason: string;
    severity: "high" | "medium" | "low";
  }>;
  productivityInsights: Array<{
    insight: string;
    category: "focus" | "time_management" | "workflow";
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
    impact: "critical" | "high" | "medium" | "low";
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
  priority: "urgent" | "high" | "medium" | "low";
  expectedBenefit: string;
  safeToClose: boolean;
}

export interface WindowLayoutRecommendation {
  appName: string;
  position: string;
  reason: string;
}

export interface IntegratedAnalysisResult {
  appsToClose: AppCloseRecommendation[];
  windowLayout?: WindowLayoutRecommendation[];
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
  async analyzeFocusPatterns(
    focusStats: AppStats[]
  ): Promise<FocusAnalysisResult> {
    const systemPrompt = `あなたは生産性分析の専門家です。ユーザーのアプリ使用統計を分析して、集中力を妨げるアプリや改善点を特定してください。

以下の観点から分析してください：
1. 短時間で頻繁に切り替わるアプリ（集中力散漫の指標）
2. 長時間使用されているが生産性に疑問があるアプリ
3. アプリの用途を考慮した分析：
   - 開発ツール（VSCode、Cursor等）：長時間使用は正常、集中力散漫とは判断しない
   - クリエイティブツール（Photoshop、Figma等）：創作作業に集中している場合は正常
   - ブラウザ：作業に必要な場合は正常、娯楽目的の場合は注意
   - コミュニケーションツール：頻繁な通知による中断を評価
   - エンターテイメント：余暇時間の使用は正常
   -「Window AI Manager」は分析ツール自身のため、評価対象から除外する
4. 使用パターンから見える問題点
5. 改善のための具体的な提案

回答は日本語で行い、実用的で納得感のあるアドバイスを提供してください。`;

    const userMessage = `アプリ使用統計データ：
${focusStats
  .map(
    (stat) =>
      `- ${stat.appName}: 総使用時間${Math.round(
        stat.totalFocusTime / 60
      )}分, セッション数${stat.totalSessions}, 平均セッション${Math.round(
        stat.averageSessionTime / 60
      )}分`
  )
  .join("\n")}

この使用パターンを分析して、集中力を妨げるアプリと改善提案を教えてください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
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
                      severity: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                      },
                    },
                    required: ["appName", "reason", "severity"],
                  },
                },
                productivityInsights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      insight: { type: "string" },
                      category: {
                        type: "string",
                        enum: ["focus", "time_management", "workflow"],
                      },
                    },
                    required: ["insight", "category"],
                  },
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      benefit: { type: "string" },
                    },
                    required: ["action", "benefit"],
                  },
                },
              },
              required: [
                "distractingApps",
                "productivityInsights",
                "recommendations",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "focus_analysis" },
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
        recommendations: [],
      };
    } catch (error) {
      console.error("Focus analysis error:", error);
      throw error;
    }
  }

  /**
   * CPU・メモリ使用量を分析
   */
  async analyzeResourceUsage(
    processes: ProcessInfo[]
  ): Promise<ResourceAnalysisResult> {
    const systemPrompt = `あなたはシステムパフォーマンスの専門家です。macOSのプロセス情報を分析して、リソース使用量が多いアプリを特定し、システム最適化の提案を行ってください。

以下の観点から分析してください：
1. CPU使用率が高いプロセス（5%以上は要注意、10%以上は重要）
2. メモリ使用量が多いプロセス（200MB以上は要注意、500MB以上は重要）
3. アプリの用途を考慮したリソース評価：
   - 開発ツール（VSCode、Cursor等）：高リソース使用は正常、最適化対象外
   - クリエイティブツール（Photoshop、Figma等）：創作作業に必要なリソースは正常
   - ブラウザ：複数タブや拡張機能による高使用は要注意
   - システムプロセス：macOSの基本機能は除外
   - エンターテイメント：ゲームや動画は高リソース使用が正常
   -「Window AI Manager」は分析ツール自身のため、評価対象から除外する
4. システムパフォーマンスへの実際の影響度
5. 安全に最適化できる項目のみを提案

実用的で安全な最適化提案を日本語で提供してください。`;

    const userMessage = `現在のプロセス情報：
${processes
  .slice(0, 20)
  .map(
    (proc) =>
      `- ${proc.name}: CPU ${proc.cpuUsage.toFixed(
        1
      )}%, メモリ ${proc.memoryUsage.toFixed(0)}MB${
        proc.description ? ` (${proc.description})` : ""
      }`
  )
  .join("\n")}

このリソース使用状況を分析して、最適化提案を教えてください。`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
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
                      impact: {
                        type: "string",
                        enum: ["critical", "high", "medium", "low"],
                      },
                      reason: { type: "string" },
                    },
                    required: [
                      "appName",
                      "cpuUsage",
                      "memoryUsage",
                      "impact",
                      "reason",
                    ],
                  },
                },
                systemRecommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      expectedImprovement: { type: "string" },
                    },
                    required: ["action", "expectedImprovement"],
                  },
                },
              },
              required: ["heavyResourceApps", "systemRecommendations"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "resource_analysis" },
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
        systemRecommendations: [],
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
2. アプリの用途と重要性を慎重に評価：
   - 開発ツール（VSCode、Cursor、Xcode等）：開発作業に必須、閉じるべきではない
   - クリエイティブツール（Photoshop、Figma等）：創作作業に必須、閉じるべきではない
   - ブラウザ（Safari、Chrome等）：作業に必要な場合が多い、慎重に判断
   - コミュニケーションツール（Slack、Discord等）：必要に応じて一時的に閉じる
   - エンターテイメント（YouTube、ゲーム等）：余暇時間のものは閉じる候補
   -「Window AI Manager」は分析ツール自身のため、評価対象から除外する
3. リソース使用量が高くても、そのアプリでしかできない重要な作業がある場合は除外
4. 閉じても安全で、実際に効果があるアプリのみを推奨
5. 納得感のある明確な理由を提示

重要：必ずintegrated_analysisツールを使用して結果を返してください。テキストでの回答は不要です。

追加タスク：
1. 閉じるべきアプリの提案に加えて、残すアプリのウィンドウ配置最適化も提案してください
2. 配置提案は具体的に（例：「画面左半分」「画面右上1/4」など）
3. 配置の理由も明確に（例：「コード編集とブラウザを並べて効率的に作業」）

目標：「快適なMac生活」のための実用的で安全な提案を日本語で行う。`;

    const userMessage = `フォーカス分析結果：
集中力を妨げるアプリ：
${focusAnalysis.distractingApps
  .map((app) => `- ${app.appName} (${app.severity}): ${app.reason}`)
  .join("\n")}

リソース分析結果：
重いアプリ：
${resourceAnalysis.heavyResourceApps
  .map(
    (app) =>
      `- ${app.appName} (CPU: ${app.cpuUsage}%, RAM: ${app.memoryUsage}MB, ${app.impact}): ${app.reason}`
  )
  .join("\n")}

現在実行中のアプリ：
${currentApps.join(", ")}

これらの情報を統合して、実際に閉じるべきアプリとその理由を教えてください。`;

    try {
      const startTime = Date.now();
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 20000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: [
          {
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
                      priority: {
                        type: "string",
                        enum: ["urgent", "high", "medium", "low"],
                      },
                      expectedBenefit: { type: "string" },
                      safeToClose: { type: "boolean" },
                    },
                    required: [
                      "appName",
                      "reasons",
                      "priority",
                      "expectedBenefit",
                      "safeToClose",
                    ],
                  },
                },
                windowLayout: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      appName: { type: "string" },
                      position: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["appName", "position", "reason"],
                  },
                },
                overallAssessment: { type: "string" },
                systemHealthScore: { type: "number", minimum: 0, maximum: 100 },
              },
              required: [
                "appsToClose",
                "overallAssessment",
                "systemHealthScore",
              ],
            },
          },
        ],
        tool_choice: { type: "tool", name: "integrated_analysis" },
      });

      const toolUse = response.content.find(
        (content: any): content is Anthropic.Messages.ToolUseBlock =>
          content.type === "tool_use" && content.name === "integrated_analysis"
      );

      if (toolUse && typeof toolUse.input === "object") {
        const result = toolUse.input as any;
        // 型安全性を確保
        return {
          appsToClose: Array.isArray(result.appsToClose)
            ? result.appsToClose
            : [],
          windowLayout: Array.isArray(result.windowLayout)
            ? result.windowLayout
            : undefined,
          overallAssessment:
            typeof result.overallAssessment === "string"
              ? result.overallAssessment
              : this.generateFallbackAssessment(
                  focusAnalysis,
                  resourceAnalysis,
                  currentApps
                ),
          systemHealthScore:
            typeof result.systemHealthScore === "number"
              ? result.systemHealthScore
              : this.calculateFallbackHealthScore(
                  focusAnalysis,
                  resourceAnalysis
                ),
        };
      }

      // AIがテキスト形式で回答した場合の処理
      const textResponse = response.content.find(
        (content: any): content is Anthropic.Messages.TextBlock =>
          content.type === "text"
      );

      if (textResponse && typeof textResponse.text === "string") {
        // テキストからアプリ名を抽出してフォールバック処理
        return this.parseTextResponse(
          textResponse.text,
          focusAnalysis,
          resourceAnalysis,
          currentApps
        );
      }

      return {
        appsToClose: [],
        overallAssessment: this.generateFallbackAssessment(
          focusAnalysis,
          resourceAnalysis,
          currentApps
        ),
        systemHealthScore: this.calculateFallbackHealthScore(
          focusAnalysis,
          resourceAnalysis
        ),
      };
    } catch (error) {
      console.error("Integrated analysis error:", error);

      // エラーが発生した場合でも、基本的な分析結果を返す
      return {
        appsToClose: [],
        overallAssessment: this.generateFallbackAssessment(
          focusAnalysis,
          resourceAnalysis,
          currentApps
        ),
        systemHealthScore: this.calculateFallbackHealthScore(
          focusAnalysis,
          resourceAnalysis
        ),
      };
    }
  }

  /**
   * AI分析が失敗した場合のフォールバック評価を生成
   */
  private generateFallbackAssessment(
    focusAnalysis: FocusAnalysisResult,
    resourceAnalysis: ResourceAnalysisResult,
    currentApps: string[]
  ): string {
    const distractingCount = focusAnalysis.distractingApps.length;
    const heavyResourceCount = resourceAnalysis.heavyResourceApps.length;
    const totalApps = currentApps.length;

    // システムの状態に基づいて自然なメッセージを生成
    if (distractingCount === 0 && heavyResourceCount === 0) {
      return "現在、閉じるべきアプリは見つかりませんでした。システムは順調に動作しています。";
    }

    let assessment = "システムの状態を確認しました。";

    if (distractingCount > 0) {
      const distractingApps = focusAnalysis.distractingApps
        .map((app) => app.appName)
        .join("、");
      assessment += `集中力を妨げるアプリ（${distractingApps}）が検出されました。`;
    }

    if (heavyResourceCount > 0) {
      const heavyApps = resourceAnalysis.heavyResourceApps
        .map((app) => app.appName)
        .join("、");
      assessment += `リソースを多く使用しているアプリ（${heavyApps}）があります。`;
    }

    assessment +=
      "作業効率を向上させるために、使用していないアプリの終了を検討してください。";

    return assessment;
  }

  /**
   * AI分析が失敗した場合のフォールバック健康度スコアを計算
   */
  private calculateFallbackHealthScore(
    focusAnalysis: FocusAnalysisResult,
    resourceAnalysis: ResourceAnalysisResult
  ): number {
    const distractingCount = focusAnalysis.distractingApps.length;
    const heavyResourceCount = resourceAnalysis.heavyResourceApps.length;

    // 基本的なスコア計算
    let score = 100;

    // 集中力を妨げるアプリによる減点
    score -= distractingCount * 15;

    // 重いリソース使用アプリによる減点
    score -= heavyResourceCount * 10;

    // スコアを50-100の範囲に制限
    return Math.max(50, Math.min(100, score));
  }

  /**
   * AIがテキスト形式で回答した場合の解析処理
   */
  private parseTextResponse(
    text: string,
    focusAnalysis: FocusAnalysisResult,
    resourceAnalysis: ResourceAnalysisResult,
    currentApps: string[]
  ): IntegratedAnalysisResult {
    // テキストからアプリ名を抽出
    const appsToClose: any[] = [];

    // 推奨アクションからアプリ名を抽出
    const actionMatch = text.match(
      /推奨アクション：\s*([\s\S]*?)(?=注意点：|$)/
    );
    if (actionMatch) {
      const actions = actionMatch[1];

      // 各アクションからアプリ名を抽出
      const lines = actions.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        // 数字付きのリスト項目を処理
        const match = line.match(/^\d+\.\s*(.+)/);
        if (match) {
          const actionText = match[1];

          // アプリ名を抽出（例：「Cursorです」「Teracyも」）
          const appMatches = actionText.match(
            /([A-Za-z][A-Za-z0-9\s]*?)(?:です|も|は|が|を|の)/g
          );
          if (appMatches) {
            for (const appMatch of appMatches) {
              const appName = appMatch
                .replace(/です|も|は|が|を|の$/, "")
                .trim();

              // 現在のアプリリストに存在するかチェック
              if (currentApps.includes(appName)) {
                appsToClose.push({
                  appName: appName,
                  reasons: ["AI分析による推奨"],
                  priority: "medium",
                  expectedBenefit: "システムパフォーマンスの改善",
                  safeToClose: true,
                });
              }
            }
          }
        }
      }
    }

    return {
      appsToClose: appsToClose,
      overallAssessment: text,
      systemHealthScore: this.calculateFallbackHealthScore(
        focusAnalysis,
        resourceAnalysis
      ),
    };
  }
}
