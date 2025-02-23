interface Formula {
  name: string;
  full_name: string;
  tap: string;
  oldnames: string[];
  aliases: string[];
  versioned_formulae: string[];
  desc: string;
  license: string;
  homepage: string;
  versions: {
    stable: string;
    head: string;
    bottle: boolean;
  };
  urls: {
    stable: {
      url: string;
      tag: string | null;
      revision: string | null;
      using: string | null;
      checksum: string;
    } | null;
    head: {
      url: string;
      branch: string;
      using: string | null;
    } | null;
  };
  revision: number;
  version_scheme: number;
  bottle: {
    stable: {
      rebuild: number;
      root_url: string;
      files: {
        [key: string]: {
          cellar: string;
          url: string;
          sha256: string;
        };
      };
    };
  };
  pour_bottle_only_if: string | null;
  keg_only: boolean;
  keg_only_reason: string | null;
  options: string[];
  build_dependencies: string[];
  dependencies: string[];
  test_dependencies: string[];
  recommended_dependencies: string[];
  optional_dependencies: string[];
  uses_from_macos: string[];
  uses_from_macos_bounds: {}[];
  requirements: [];
  conflicts_with: [];
  conflicts_with_reasons: [];
  link_overwrite: [];
  caveats: string | null;
  installed: {
    version: string;
    used_options: string[];
    built_as_bottle: boolean;
    poured_from_bottle: boolean;
    time: number;
    runtime_dependencies: {
      full_name: string;
      version: string;
      revision: number;
      pkg_version: string;
      declared_directly: boolean;
    }[];
    installed_as_dependency: boolean;
    installed_on_request: boolean;
  }[];
  linked_keg: string;
  pinned: boolean;
  outdated: boolean;
  deprecated: boolean;
  deprecation_date: string | null;
  deprecation_reason: string | null;
  deprecation_replacement: string | null;
  disabled: boolean;
  disable_date: string | null;
  disable_reason: string | null;
  disable_replacement: string | null;
  post_install_defined: boolean;
  service: string | null;
  tap_git_head: string;
  ruby_source_path: string;
  ruby_source_checksum: {
    sha256: string;
  };
  head_dependencies: {
    build_dependencies: string[];
    dependencies: string[];
    test_dependencies: string[];
    recommended_dependencies: string[];
    optional_dependencies: string[];
    uses_from_macos: string[];
    uses_from_macos_bounds: {}[];
  };
  variations: {
    [key: string]: {
      dependencies: string[];
      head_dependencies: {
        build_dependencies: string[];
        dependencies: string[];
        test_dependencies: string[];
        recommended_dependencies: string[];
        optional_dependencies: string[];
        uses_from_macos: string[];
        uses_from_macos_bounds: {}[];
      };
    };
  };
  analytics: {
    install: {
      "30d": { [key: string]: number };
      "90d": { [key: string]: number };
      "365d": { [key: string]: number };
    };
    install_on_request: {
      "30d": { [key: string]: number };
      "90d": { [key: string]: number };
      "365d": { [key: string]: number };
    };
    build_error: {
      "30d": { [key: string]: number };
    };
  };
  generated_date: string;
}
