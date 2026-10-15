export class NotConfiguredError extends Error {
  constructor(service: string) {
    super(`${service} is not configured`);
    this.name = "NotConfiguredError";
  }
}
