import { version as packageVersion } from "../package.json";

declare const UNBLOK_BUILD_VERSION: string | undefined;

export const version =
  typeof UNBLOK_BUILD_VERSION === "undefined"
    ? packageVersion
    : UNBLOK_BUILD_VERSION;
