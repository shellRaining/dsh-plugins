// The lifecycle every appearance feature follows: update() is idempotent and
// switches the feature to the given state; dispose() removes everything it added.
export interface Feature<State> {
  update(state: State): void;
  dispose(): void;
}
