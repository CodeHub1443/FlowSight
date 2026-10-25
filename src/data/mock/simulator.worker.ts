/// <reference lib="webworker" />
import { SimController, type Cmd, type Evt } from './core/controller';

// Thin wrapper: all behaviour lives in the framework-free SimController (src/data/mock/core).
const scope = self as unknown as {
  postMessage(message: Evt): void;
  onmessage: ((e: MessageEvent<Cmd>) => void) | null;
};

const controller = new SimController((e) => scope.postMessage(e));
controller.start();
scope.onmessage = (e) => controller.handle(e.data);
