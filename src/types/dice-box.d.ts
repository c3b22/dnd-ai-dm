declare module '@3d-dice/dice-box' {
  export interface DiceBoxConfig {
    container?: string;
    assetPath: string;
    theme?: string;
    themeColor?: string;
    onRollComplete?: (results: unknown) => void;
    [key: string]: unknown;
  }

  export default class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<unknown>;
    roll(notation: string): void;
    clear(): void;
    onRollComplete: (results: unknown) => void;
  }
}
