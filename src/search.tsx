import {
  Action,
  ActionPanel,
  IconAccessory,
  Icons,
  List,
} from "@project-gauntlet/api/components";
import { Detail } from "@project-gauntlet/api/components";

import { ReactElement, useState, useEffect, useCallback, useMemo } from "react";
import { Environment } from "@project-gauntlet/api/helpers";
import { useNavigation } from "@project-gauntlet/api/hooks";

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOMEBREW_PATH = "/opt/homebrew/bin/brew";

// Cache structure for installation status
interface InstallationCache {
  formulae: Record<string, boolean>;
  casks: Record<string, boolean>;
  lastUpdated: number;
}

// Cache structure for outdated packages
interface OutdatedCache {
  formulae: string[];
  casks: string[];
  lastUpdated: number;
}

async function fetchWithCache<T>(url: string, filename: string): Promise<T> {
  const cacheFilePath = `${Environment.pluginCacheDir}/${filename}`;

  try {
    const stat = await Deno.stat(cacheFilePath);
    const now = Date.now();
    const age = now - stat.mtime!.getTime();

    console.log(`Checking cache for ${filename}. Age: ${age / 1000}s`);
    if (age < CACHE_EXPIRY_MS) {
      console.log(`Cache valid. Loading ${filename} from disk.`);
      const cachedData = await Deno.readTextFile(cacheFilePath);
      return JSON.parse(cachedData) as T;
    } else {
      console.log(`Cache expired for ${filename}, fetching new data.`);
    }
  } catch (err) {
    console.log(`Cache miss for ${filename}. Fetching new data.`);
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(`Fetched new data for ${filename}. Writing to cache.`);

    await Deno.writeTextFile(cacheFilePath, JSON.stringify(data));
    return data as T;
  } catch (error) {
    console.error(`Failed to fetch ${filename}:`, error);
    throw error;
  }
}

async function fetchFormulae(): Promise<Formula[]> {
  return fetchWithCache<Formula[]>(
    "https://formulae.brew.sh/api/formula.json",
    "formulae.json",
  );
}

async function fetchCasks(): Promise<Cask[]> {
  return fetchWithCache<Cask[]>(
    "https://formulae.brew.sh/api/cask.json",
    "casks.json",
  );
}

interface Formula {
  name: string;
  desc: string;
  homepage: string;
  versions: {
    stable: string;
  };
  license: string | null;
  generated_date: string;
}

interface Cask {
  token: string;
  name: string[];
  desc: string;
  homepage: string;
  version: string;
}

// Batch fetch installation status for all packages
async function fetchInstalledPackages(): Promise<InstallationCache> {
  const cacheFilePath = `${Environment.pluginCacheDir}/installation_status.json`;
  const now = Date.now();

  try {
    const stat = await Deno.stat(cacheFilePath);
    const age = now - stat.mtime!.getTime();

    // Cache installation status for 10 minutes
    if (age < 10 * 60 * 1000) {
      const cachedData = await Deno.readTextFile(cacheFilePath);
      return JSON.parse(cachedData) as InstallationCache;
    }
  } catch (err) {
    console.log("No installation status cache found or error reading it");
  }

  // Fetch all installed formulae
  const formulaProcess = new Deno.Command(HOMEBREW_PATH, {
    args: ["list", "--formula"],
    stdout: "piped",
    stderr: "null",
  });

  // Fetch all installed casks
  const caskProcess = new Deno.Command(HOMEBREW_PATH, {
    args: ["list", "--cask"],
    stdout: "piped",
    stderr: "null",
  });

  try {
    const [formulaResult, caskResult] = await Promise.all([
      formulaProcess.output(),
      caskProcess.output(),
    ]);

    const installedFormulae = new TextDecoder()
      .decode(formulaResult.stdout)
      .trim()
      .split("\n")
      .filter(Boolean);

    const installedCasks = new TextDecoder()
      .decode(caskResult.stdout)
      .trim()
      .split("\n")
      .filter(Boolean);

    // Create maps for O(1) lookups
    const formulaeMap: Record<string, boolean> = {};
    const casksMap: Record<string, boolean> = {};

    installedFormulae.forEach((formula) => {
      // Extract package name without version info
      const name = formula.split(" ")[0];
      formulaeMap[name] = true;
    });

    installedCasks.forEach((cask) => {
      casksMap[cask] = true;
    });

    const cache: InstallationCache = {
      formulae: formulaeMap,
      casks: casksMap,
      lastUpdated: now,
    };

    // Save cache to disk
    await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
    return cache;
  } catch (error) {
    console.error("Error fetching installed packages:", error);
    return {
      formulae: {},
      casks: {},
      lastUpdated: now,
    };
  }
}

// Fetch outdated packages
async function fetchOutdatedPackages(): Promise<OutdatedCache> {
  const cacheFilePath = `${Environment.pluginCacheDir}/outdated_packages.json`;
  const now = Date.now();

  try {
    const stat = await Deno.stat(cacheFilePath);
    const age = now - stat.mtime!.getTime();

    // Cache outdated status for 30 minutes
    if (age < 30 * 60 * 1000) {
      const cachedData = await Deno.readTextFile(cacheFilePath);
      return JSON.parse(cachedData) as OutdatedCache;
    }
  } catch (err) {
    console.log("No outdated packages cache found or error reading it");
  }

  try {
    const process = new Deno.Command(HOMEBREW_PATH, {
      args: ["outdated", "--json=v2"],
      stdout: "piped",
      stderr: "piped",
    });

    const { stdout } = await process.output();
    const result = JSON.parse(new TextDecoder().decode(stdout));

    const outdatedFormulae = result.formulae.map((f: any) => f.name);
    const outdatedCasks = result.casks.map((c: any) => c.name);

    const cache: OutdatedCache = {
      formulae: outdatedFormulae,
      casks: outdatedCasks,
      lastUpdated: now,
    };

    await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
    return cache;
  } catch (error) {
    console.error("Error fetching outdated packages:", error);
    return {
      formulae: [],
      casks: [],
      lastUpdated: now,
    };
  }
}

async function uninstallPackage(
  name: string,
  isCask: boolean,
): Promise<boolean> {
  const args = isCask ? ["uninstall", "--cask", name] : ["uninstall", name];
  try {
    const process = new Deno.Command(HOMEBREW_PATH, {
      args: args,
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.output();
    if (code === 0) {
      console.log(`Successfully uninstalled ${name}`);

      // Update installation cache
      const cacheFilePath = `${Environment.pluginCacheDir}/installation_status.json`;
      try {
        const cacheData = await Deno.readTextFile(cacheFilePath);
        const cache = JSON.parse(cacheData) as InstallationCache;

        if (isCask) {
          delete cache.casks[name];
        } else {
          delete cache.formulae[name];
        }

        await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
      } catch (err) {
        console.error("Error updating installation cache:", err);
      }

      return true;
    } else {
      console.error(`Failed to uninstall ${name}`);
      return false;
    }
  } catch (error) {
    console.error(`Error uninstalling ${name}:`, error);
    return false;
  }
}

async function installPackage(name: string, isCask: boolean): Promise<boolean> {
  const args = isCask ? ["install", "--cask", name] : ["install", name];
  try {
    const process = new Deno.Command(HOMEBREW_PATH, {
      args: args,
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.output();
    if (code === 0) {
      console.log(`Successfully installed ${name}`);

      // Update installation cache
      const cacheFilePath = `${Environment.pluginCacheDir}/installation_status.json`;
      try {
        const cacheData = await Deno.readTextFile(cacheFilePath);
        const cache = JSON.parse(cacheData) as InstallationCache;

        if (isCask) {
          cache.casks[name] = true;
        } else {
          cache.formulae[name] = true;
        }

        await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
      } catch (err) {
        console.error("Error updating installation cache:", err);
      }

      return true;
    } else {
      console.error(`Failed to install ${name}`);
      return false;
    }
  } catch (error) {
    console.error(`Error installing ${name}:`, error);
    return false;
  }
}

async function upgradePackage(name: string, isCask: boolean): Promise<boolean> {
  const args = isCask ? ["upgrade", "--cask", name] : ["upgrade", name];
  try {
    const process = new Deno.Command(HOMEBREW_PATH, {
      args: args,
      stdout: "inherit",
      stderr: "inherit",
    });
    const { code } = await process.output();
    if (code === 0) {
      console.log(`Successfully upgraded ${name}`);

      // Update outdated cache
      const cacheFilePath = `${Environment.pluginCacheDir}/outdated_packages.json`;
      try {
        const cacheData = await Deno.readTextFile(cacheFilePath);
        const cache = JSON.parse(cacheData) as OutdatedCache;

        if (isCask) {
          cache.casks = cache.casks.filter((cask) => cask !== name);
        } else {
          cache.formulae = cache.formulae.filter((formula) => formula !== name);
        }

        await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
      } catch (err) {
        console.error("Error updating outdated cache:", err);
      }

      return true;
    } else {
      console.error(`Failed to upgrade ${name}`);
      return false;
    }
  } catch (error) {
    console.error(`Error upgrading ${name}:`, error);
    return false;
  }
}

function FormulaDetailView(props: {
  formula: Formula;
  isInstalled: boolean;
  isOutdated: boolean;
}): ReactElement {
  const {
    formula,
    isInstalled: initialIsInstalled,
    isOutdated: initialIsOutdated,
  } = props;
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(initialIsInstalled);
  const [isOutdated, setIsOutdated] = useState(initialIsOutdated);

  const handleInstall = async () => {
    setIsInstalling(true);
    const success = await installPackage(formula.name, false);
    if (success) {
      setIsInstalled(true);
    }
    setIsInstalling(false);
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    const success = await upgradePackage(formula.name, false);
    if (success) {
      setIsOutdated(false);
    }
    setIsUpgrading(false);
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    const success = await uninstallPackage(formula.name, false);
    if (success) {
      setIsInstalled(false);
    }
    setIsUninstalling(false);
  };

  return (
    <Detail
      isLoading={isInstalling || isUpgrading || isUninstalling}
      actions={
        <ActionPanel>
          {!isInstalled && (
            <Action label="Install Formula" onAction={handleInstall} />
          )}
          {isInstalled && isOutdated && (
            <Action label="Upgrade Formula" onAction={handleUpgrade} />
          )}
          {isInstalled && (
            <Action label="Uninstall Formula" onAction={handleUninstall} />
          )}
        </ActionPanel>
      }
    >
      <Detail.Content>
        <Detail.Content.H1>{formula.name}</Detail.Content.H1>
        <Detail.Content.Paragraph>{formula.desc}</Detail.Content.Paragraph>
      </Detail.Content>
      <Detail.Metadata>
        <Detail.Metadata.Link label="Homepage" href={formula.homepage}>
          {formula.homepage}
        </Detail.Metadata.Link>
        <Detail.Metadata.Value label="Version">
          {formula.versions.stable}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label="License">
          {formula.license ?? "None"}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label="Generated Date">
          {formula.generated_date}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label="Installation Status">
          {isInstalled
            ? isOutdated
              ? "Installed (Update Available)"
              : "Installed"
            : "Not Installed"}
        </Detail.Metadata.Value>
      </Detail.Metadata>
    </Detail>
  );
}

function CaskDetailView(props: {
  cask: Cask;
  isInstalled: boolean;
  isOutdated: boolean;
}): ReactElement {
  const {
    cask,
    isInstalled: initialIsInstalled,
    isOutdated: initialIsOutdated,
  } = props;
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(initialIsInstalled);
  const [isOutdated, setIsOutdated] = useState(initialIsOutdated);

  const handleInstall = async () => {
    setIsInstalling(true);
    const success = await installPackage(cask.token, true);
    if (success) {
      setIsInstalled(true);
    }
    setIsInstalling(false);
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    const success = await upgradePackage(cask.token, true);
    if (success) {
      setIsOutdated(false);
    }
    setIsUpgrading(false);
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    const success = await uninstallPackage(cask.token, true);
    if (success) {
      setIsInstalled(false);
    }
    setIsUninstalling(false);
  };

  return (
    <Detail
      isLoading={isInstalling || isUpgrading || isUninstalling}
      actions={
        <ActionPanel>
          {!isInstalled && (
            <Action label="Install Cask" onAction={handleInstall} />
          )}
          {isInstalled && isOutdated && (
            <Action label="Upgrade Cask" onAction={handleUpgrade} />
          )}
          {isInstalled && !isOutdated && (
            <Action label="Check for Updates" onAction={handleUpgrade} />
          )}
          {isInstalled && (
            <Action label="Uninstall Cask" onAction={handleUninstall} />
          )}
        </ActionPanel>
      }
    >
      <Detail.Content>
        <Detail.Content.H1>{cask.name[0] || cask.token}</Detail.Content.H1>
        <Detail.Content.Paragraph>{cask.desc}</Detail.Content.Paragraph>
      </Detail.Content>
      <Detail.Metadata>
        <Detail.Metadata.Link label="Homepage" href={cask.homepage}>
          {cask.homepage}
        </Detail.Metadata.Link>
        <Detail.Metadata.Value label="Version">
          {cask.version}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label="Installation Status">
          {isInstalled
            ? isOutdated
              ? "Installed (Update Available)"
              : "Installed"
            : "Not Installed"}
        </Detail.Metadata.Value>
      </Detail.Metadata>
    </Detail>
  );
}

export default function SearchListView(): ReactElement {
  const [searchText, setSearchText] = useState<string | undefined>("");
  const { pushView } = useNavigation();
  const [formulae, setFormulae] = useState<Formula[]>([]);
  const [casks, setCasks] = useState<Cask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [installationStatus, setInstallationStatus] =
    useState<InstallationCache | null>(null);
  const [outdatedPackages, setOutdatedPackages] =
    useState<OutdatedCache | null>(null);
  const formulaePageSize = 50;
  const casksPageSize = 50;

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      console.log("Loading data...");
      try {
        const [formulaeData, caskData, installStatus, outdatedStatus] =
          await Promise.all([
            fetchFormulae(),
            fetchCasks(),
            fetchInstalledPackages(),
            fetchOutdatedPackages(),
          ]);

        if (isMounted) {
          setFormulae(formulaeData);
          setCasks(caskData);
          setInstallationStatus(installStatus);
          setOutdatedPackages(outdatedStatus);
          setIsLoading(false);
          console.log("Data loading complete.");
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const isFormulaInstalled = useCallback(
    (name: string) => {
      return installationStatus?.formulae[name] || false;
    },
    [installationStatus],
  );

  const isCaskInstalled = useCallback(
    (token: string) => {
      return installationStatus?.casks[token] || false;
    },
    [installationStatus],
  );

  const isFormulaOutdated = useCallback(
    (name: string) => {
      return outdatedPackages?.formulae.includes(name) || false;
    },
    [outdatedPackages],
  );

  const isCaskOutdated = useCallback(
    (token: string) => {
      return outdatedPackages?.casks.includes(token) || false;
    },
    [outdatedPackages],
  );

  const onClick = (id: string | undefined) => {
    if (!id) return;

    const formula = getFormulaByID(id);
    if (formula) {
      pushView(
        <FormulaDetailView
          formula={formula}
          isInstalled={isFormulaInstalled(formula.name)}
          isOutdated={isFormulaOutdated(formula.name)}
        />,
      );
    } else {
      const cask = getCaskByID(id);
      if (cask) {
        pushView(
          <CaskDetailView
            cask={cask}
            isInstalled={isCaskInstalled(cask.token)}
            isOutdated={isCaskOutdated(cask.token)}
          />,
        );
      } else {
        console.log("No match found!");
      }
    }
  };

  // Filter packages by search text
  const filteredFormulae = useMemo(() => {
    return formulae.filter((formula) =>
      formula.name.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
    );
  }, [formulae, searchText]);

  const filteredCasks = useMemo(() => {
    return casks.filter((cask) =>
      cask.token.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
    );
  }, [casks, searchText]);

  const displayedFormulae = filteredFormulae.slice(0, formulaePageSize);
  const displayedCasks = filteredCasks.slice(0, casksPageSize);

  // Render badges for installation and update status
  const getFormulaAccessories = (name: string) => {
    const accessories = [];

    if (isFormulaInstalled(name)) {
      accessories.push(
        <IconAccessory
          icon={Icons.Checkmark}
          tooltip="Installed"
          key={`installed-${name}`}
        ></IconAccessory>,
      );
      if (isFormulaOutdated(name)) {
        accessories.push(
          <IconAccessory
            icon={Icons.ArrowClockwise}
            tooltip="Update Available"
            key={`update-${name}`}
          ></IconAccessory>,
        );
      }
    }

    return accessories;
  };

  const getCaskAccessories = (token: string) => {
    const accessories = [];

    if (isCaskInstalled(token)) {
      accessories.push(
        <IconAccessory
          icon={Icons.Checkmark}
          tooltip="Installed"
          key={`installed-${token}`}
        ></IconAccessory>,
      );
      if (isCaskOutdated(token)) {
        accessories.push(
          <IconAccessory
            icon={Icons.ArrowClockwise}
            tooltip="Update Available"
            key={`update-${token}`}
          ></IconAccessory>,
        );
      }
    }

    return accessories;
  };

  return (
    <List
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action label="Show Details" onAction={onClick} />
        </ActionPanel>
      }
    >
      <List.SearchBar
        placeholder="Search formulae or casks..."
        value={searchText}
        onChange={setSearchText}
      />

      <List.Section title="Formulae">
        {displayedFormulae.map((formula) => (
          <List.Section.Item
            key={formula.name}
            title={formula.name}
            subtitle={formula.desc}
            id={formula.name}
            accessories={getFormulaAccessories(formula.name)}
          />
        ))}
      </List.Section>

      <List.Section title="Casks">
        {displayedCasks.map((cask) => (
          <List.Section.Item
            key={cask.token}
            title={cask.name[0] || cask.token}
            subtitle={cask.desc}
            id={cask.token}
            accessories={getCaskAccessories(cask.token)}
          />
        ))}
      </List.Section>
    </List>
  );

  function getFormulaByID(id: string): Formula | undefined {
    return formulae.find((formula) => formula.name === id);
  }

  function getCaskByID(id: string): Cask | undefined {
    return casks.find((cask) => cask.token === id);
  }
}
