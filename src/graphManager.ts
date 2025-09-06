import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface EntityNode {
  type: 'entity';
  name: string;
  entityType: 'Application' | 'Person' | 'AI Tool';
  observations: string[];
}

export interface RelationEdge {
  type: 'relation';
  from: string;
  to: string;
  relationType: string;
}

export type GraphNode = EntityNode | RelationEdge;

export interface OnboardingStatus {
  completed: boolean;
  completedAt?: string;
  analyzedApps?: string[];
}

export class GraphManager {
  private graphPath: string;
  private onboardingPath: string;
  private graph: GraphNode[] = [];
  private onboardingStatus: OnboardingStatus = { completed: false };

  constructor() {
    // Store in user data directory
    this.graphPath = path.join(app.getPath('userData'), 'application_graph.json');
    this.onboardingPath = path.join(app.getPath('userData'), 'onboarding_status.json');
    this.loadOnboardingStatus();
    this.loadGraph();
  }

  private loadOnboardingStatus(): void {
    try {
      if (fs.existsSync(this.onboardingPath)) {
        const data = fs.readFileSync(this.onboardingPath, 'utf-8');
        this.onboardingStatus = JSON.parse(data);
        console.log('Onboarding status loaded:', this.onboardingStatus.completed);
      } else {
        // Initialize as not completed
        this.onboardingStatus = { completed: false };
        this.saveOnboardingStatus();
      }
    } catch (error) {
      console.error('Error loading onboarding status:', error);
      this.onboardingStatus = { completed: false };
    }
  }

  private saveOnboardingStatus(): void {
    try {
      fs.writeFileSync(this.onboardingPath, JSON.stringify(this.onboardingStatus, null, 2));
      console.log('Onboarding status saved');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  }

  public isOnboardingCompleted(): boolean {
    return this.onboardingStatus.completed;
  }

  public completeOnboarding(analyzedApps: string[]): void {
    this.onboardingStatus = {
      completed: true,
      completedAt: new Date().toISOString(),
      analyzedApps
    };
    this.saveOnboardingStatus();
  }

  private loadGraph(): void {
    try {
      if (fs.existsSync(this.graphPath)) {
        const data = fs.readFileSync(this.graphPath, 'utf-8');
        this.graph = JSON.parse(data);
        console.log(`Loaded graph with ${this.graph.length} nodes`);
      } else {
        // Initialize with empty graph
        this.graph = [];
        this.saveGraph();
      }
    } catch (error) {
      console.error('Error loading graph:', error);
      this.graph = [];
    }
  }

  private saveGraph(): void {
    try {
      fs.writeFileSync(this.graphPath, JSON.stringify(this.graph, null, 2));
      console.log('Graph saved successfully');
    } catch (error) {
      console.error('Error saving graph:', error);
    }
  }

  public hasApplication(appName: string): boolean {
    return this.graph.some(
      node => node.type === 'entity' && 
             node.entityType === 'Application' && 
             node.name === appName
    );
  }

  public getApplication(appName: string): EntityNode | null {
    const app = this.graph.find(
      node => node.type === 'entity' && 
             node.entityType === 'Application' && 
             node.name === appName
    ) as EntityNode;
    return app || null;
  }

  public getUnknownApplications(appNames: string[]): string[] {
    return appNames.filter(name => !this.hasApplication(name));
  }

  public addApplications(apps: Array<{name: string, observations: string[]}>): void {
    for (const app of apps) {
      if (!this.hasApplication(app.name)) {
        const newApp: EntityNode = {
          type: 'entity',
          name: app.name,
          entityType: 'Application',
          observations: app.observations
        };
        this.graph.push(newApp);
      }
    }
    this.saveGraph();
  }

  public updateApplication(appName: string, observations: string[]): void {
    const appIndex = this.graph.findIndex(
      node => node.type === 'entity' && 
             node.entityType === 'Application' && 
             node.name === appName
    );
    
    if (appIndex !== -1) {
      (this.graph[appIndex] as EntityNode).observations = observations;
      this.saveGraph();
    }
  }

  public addRelation(from: string, to: string, relationType: string): void {
    const relation: RelationEdge = {
      type: 'relation',
      from,
      to,
      relationType
    };
    
    // Check if relation already exists
    const exists = this.graph.some(
      node => node.type === 'relation' &&
             node.from === from &&
             node.to === to &&
             node.relationType === relationType
    );
    
    if (!exists) {
      this.graph.push(relation);
      this.saveGraph();
    }
  }

  public getGraph(): GraphNode[] {
    return [...this.graph];
  }

  /**
   * すべてのデータをクリア（リセット機能用）
   */
  public clearData(): void {
    try {
      // application_graph.jsonを削除
      if (fs.existsSync(this.graphPath)) {
        fs.unlinkSync(this.graphPath);
        console.log('Deleted application_graph.json');
      } else {
        console.log('application_graph.json not found');
      }
      
      // onboarding_status.jsonを削除
      if (fs.existsSync(this.onboardingPath)) {
        fs.unlinkSync(this.onboardingPath);
        console.log('Deleted onboarding_status.json');
      } else {
        console.log('onboarding_status.json not found');
      }
      
      // メモリ上のデータもクリア
      this.graph = [];
      this.onboardingStatus = { completed: false };
      
      // 強制的に未完了状態のファイルを作成
      this.saveOnboardingStatus();
      
      console.log('All local data cleared and reset to initial state');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
}