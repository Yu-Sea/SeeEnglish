export {};

declare global {
  type CloseBehavior = 'ask' | 'tray' | 'quit';

  interface Window {
    seeEnglish?: {
      getCloseBehavior: () => Promise<CloseBehavior>;
      setCloseBehavior: (value: CloseBehavior) => Promise<CloseBehavior>;
    };
  }
}
