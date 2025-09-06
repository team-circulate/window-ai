import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface WindowPreset {
  appName: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  windows: WindowPreset[];
  createdAt: string;
  updatedAt: string;
}

export class PresetManager {
  private presetsPath: string;
  private presets: Map<string, Preset>;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.presetsPath = path.join(userDataPath, 'presets.json');
    this.presets = new Map();
    this.loadPresets();
  }

  private loadPresets(): void {
    try {
      if (fs.existsSync(this.presetsPath)) {
        const data = fs.readFileSync(this.presetsPath, 'utf-8');
        const presetsArray: Preset[] = JSON.parse(data);
        presetsArray.forEach(preset => {
          this.presets.set(preset.id, preset);
        });
        console.log(`Loaded ${this.presets.size} presets`);
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
      this.presets = new Map();
    }
  }

  private savePresets(): void {
    try {
      const presetsArray = Array.from(this.presets.values());
      fs.writeFileSync(this.presetsPath, JSON.stringify(presetsArray, null, 2));
      console.log('Presets saved successfully');
    } catch (error) {
      console.error('Failed to save presets:', error);
    }
  }

  public createPreset(name: string, description: string | undefined, windows: WindowPreset[]): Preset {
    const preset: Preset = {
      id: `preset_${Date.now()}`,
      name,
      description,
      windows,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.presets.set(preset.id, preset);
    this.savePresets();
    
    return preset;
  }

  public updatePreset(id: string, updates: Partial<Preset>): Preset | null {
    const preset = this.presets.get(id);
    if (!preset) {
      return null;
    }

    const updatedPreset = {
      ...preset,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.presets.set(id, updatedPreset);
    this.savePresets();
    
    return updatedPreset;
  }

  public deletePreset(id: string): boolean {
    const deleted = this.presets.delete(id);
    if (deleted) {
      this.savePresets();
    }
    return deleted;
  }

  public getPreset(id: string): Preset | undefined {
    return this.presets.get(id);
  }

  public getAllPresets(): Preset[] {
    return Array.from(this.presets.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public clearAllPresets(): void {
    this.presets.clear();
    this.savePresets();
  }
}