interface Cask {
  token: string;
  full_token: string;
  old_tokens: string[];
  tap: string;
  name: string[];
  desc: string;
  homepage: string;
  url: string;
  url_specs: {};
  version: string;
  installed: string | null;
  installed_time: number | null;
  bundle_version: string | null;
  bundle_short_version: string | null;
  outdated: boolean;
  sha256: string;
  artifacts: {
    uninstall?: {
      launchctl?: string[];
      quit?: string;
      delete?: string[];
      rmdir?: string | string[];
    }[];
    app?: string[];
    binary?: (
      | string
      | {
          target: string;
        }
    )[];
    uninstall_postflight?: null;
    postflight?: null;
    zap?: {
      trash: string[];
      rmdir: string[];
    }[];
  }[];
  caveats: string | null;
  depends_on?: {
    macos?: {
      ">=": string[];
    };
  };
  conflicts_with?: {
    cask?: string[];
    formula?: string[];
  };
  container: string | null;
  auto_updates: boolean;
  deprecated: boolean;
  deprecation_date: string | null;
  deprecation_reason: string | null;
  deprecation_replacement: string | null;
  disabled: boolean;
  disable_date: string | null;
  disable_reason: string | null;
  disable_replacement: string | null;
  tap_git_head: string;
  languages: string[];
  ruby_source_path: string;
  ruby_source_checksum: {
    sha256: string;
  };
  variations: {
    [key: string]: {
      url: string;
      sha256: string;
      artifacts: {
        uninstall?: {
          launchctl?: string[];
          quit?: string;
          delete?: string[];
          rmdir?: string | string[];
        }[];
        app?: string[];
        binary?: (
          | string
          | {
              target: string;
            }
        )[];
        uninstall_postflight?: null;
        postflight?: null;
        zap?: {
          trash: string[];
          rmdir: string[];
        }[];
      }[];
    };
  };
  analytics: {
    install: {
      "30d": { [key: string]: number };
      "90d": { [key: string]: number };
      "365d": { [key: string]: number };
    };
  };
  generated_date: string;
}
