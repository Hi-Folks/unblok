import type { Environment } from "../config/environment.ts";
import type { Output } from "../output.ts";
import type { StoryblokGatewayFactory } from "../storyblok/gateway.ts";

export interface CommandContext {
  createGateway: StoryblokGatewayFactory;
  environment: Environment;
  output: Output;
}

export interface Command {
  description: string;
  name: string;
  run(args: string[], context: CommandContext): Promise<void>;
  usage?: string;
}
