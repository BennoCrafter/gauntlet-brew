import { jsxs, jsx } from 'react/jsx-runtime';
import { List, ActionPanel, Action, IconAccessory, Icons, Detail } from '@project-gauntlet/api/components';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Environment } from '@project-gauntlet/api/helpers';
import { useNavigation } from '@project-gauntlet/api/hooks';

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOMEBREW_PATH = "/opt/homebrew/bin/brew";
async function fetchWithCache(url, filename) {
    const cacheFilePath = `${Environment.pluginCacheDir}/${filename}`;
    try {
        const stat = await Deno.stat(cacheFilePath);
        const now = Date.now();
        const age = now - stat.mtime.getTime();
        console.log(`Checking cache for ${filename}. Age: ${age / 1000}s`);
        if (age < CACHE_EXPIRY_MS) {
            console.log(`Cache valid. Loading ${filename} from disk.`);
            const cachedData = await Deno.readTextFile(cacheFilePath);
            return JSON.parse(cachedData);
        }
        else {
            console.log(`Cache expired for ${filename}, fetching new data.`);
        }
    }
    catch (err) {
        console.log(`Cache miss for ${filename}. Fetching new data.`);
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(`Fetched new data for ${filename}. Writing to cache.`);
        await Deno.writeTextFile(cacheFilePath, JSON.stringify(data));
        return data;
    }
    catch (error) {
        console.error(`Failed to fetch ${filename}:`, error);
        throw error;
    }
}
async function fetchFormulae() {
    return fetchWithCache("https://formulae.brew.sh/api/formula.json", "formulae.json");
}
async function fetchCasks() {
    return fetchWithCache("https://formulae.brew.sh/api/cask.json", "casks.json");
}
// Batch fetch installation status for all packages
async function fetchInstalledPackages() {
    const cacheFilePath = `${Environment.pluginCacheDir}/installation_status.json`;
    const now = Date.now();
    try {
        const stat = await Deno.stat(cacheFilePath);
        const age = now - stat.mtime.getTime();
        // Cache installation status for 10 minutes
        if (age < 10 * 60 * 1000) {
            const cachedData = await Deno.readTextFile(cacheFilePath);
            return JSON.parse(cachedData);
        }
    }
    catch (err) {
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
        const formulaeMap = {};
        const casksMap = {};
        installedFormulae.forEach((formula) => {
            // Extract package name without version info
            const name = formula.split(" ")[0];
            formulaeMap[name] = true;
        });
        installedCasks.forEach((cask) => {
            casksMap[cask] = true;
        });
        const cache = {
            formulae: formulaeMap,
            casks: casksMap,
            lastUpdated: now,
        };
        // Save cache to disk
        await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
        return cache;
    }
    catch (error) {
        console.error("Error fetching installed packages:", error);
        return {
            formulae: {},
            casks: {},
            lastUpdated: now,
        };
    }
}
// Fetch outdated packages
async function fetchOutdatedPackages() {
    const cacheFilePath = `${Environment.pluginCacheDir}/outdated_packages.json`;
    const now = Date.now();
    try {
        const stat = await Deno.stat(cacheFilePath);
        const age = now - stat.mtime.getTime();
        // Cache outdated status for 30 minutes
        if (age < 30 * 60 * 1000) {
            const cachedData = await Deno.readTextFile(cacheFilePath);
            return JSON.parse(cachedData);
        }
    }
    catch (err) {
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
        const outdatedFormulae = result.formulae.map((f) => f.name);
        const outdatedCasks = result.casks.map((c) => c.name);
        const cache = {
            formulae: outdatedFormulae,
            casks: outdatedCasks,
            lastUpdated: now,
        };
        await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
        return cache;
    }
    catch (error) {
        console.error("Error fetching outdated packages:", error);
        return {
            formulae: [],
            casks: [],
            lastUpdated: now,
        };
    }
}
async function uninstallPackage(name, isCask) {
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
                const cache = JSON.parse(cacheData);
                if (isCask) {
                    delete cache.casks[name];
                }
                else {
                    delete cache.formulae[name];
                }
                await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
            }
            catch (err) {
                console.error("Error updating installation cache:", err);
            }
            return true;
        }
        else {
            console.error(`Failed to uninstall ${name}`);
            return false;
        }
    }
    catch (error) {
        console.error(`Error uninstalling ${name}:`, error);
        return false;
    }
}
async function installPackage(name, isCask) {
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
                const cache = JSON.parse(cacheData);
                if (isCask) {
                    cache.casks[name] = true;
                }
                else {
                    cache.formulae[name] = true;
                }
                await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
            }
            catch (err) {
                console.error("Error updating installation cache:", err);
            }
            return true;
        }
        else {
            console.error(`Failed to install ${name}`);
            return false;
        }
    }
    catch (error) {
        console.error(`Error installing ${name}:`, error);
        return false;
    }
}
async function upgradePackage(name, isCask) {
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
                const cache = JSON.parse(cacheData);
                if (isCask) {
                    cache.casks = cache.casks.filter((cask) => cask !== name);
                }
                else {
                    cache.formulae = cache.formulae.filter((formula) => formula !== name);
                }
                await Deno.writeTextFile(cacheFilePath, JSON.stringify(cache));
            }
            catch (err) {
                console.error("Error updating outdated cache:", err);
            }
            return true;
        }
        else {
            console.error(`Failed to upgrade ${name}`);
            return false;
        }
    }
    catch (error) {
        console.error(`Error upgrading ${name}:`, error);
        return false;
    }
}
function FormulaDetailView(props) {
    const { formula, isInstalled: initialIsInstalled, isOutdated: initialIsOutdated, } = props;
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
    return (jsxs(Detail, { isLoading: isInstalling || isUpgrading || isUninstalling, actions: jsxs(ActionPanel, { children: [!isInstalled && (jsx(Action, { label: "Install Formula", onAction: handleInstall })), isInstalled && isOutdated && (jsx(Action, { label: "Upgrade Formula", onAction: handleUpgrade })), isInstalled && !isOutdated && (jsx(Action, { label: "Check for Updates", onAction: handleUpgrade })), isInstalled && (jsx(Action, { label: "Uninstall Formula", onAction: handleUninstall }))] }), children: [jsxs(Detail.Content, { children: [jsx(Detail.Content.H1, { children: formula.name }), jsx(Detail.Content.Paragraph, { children: formula.desc })] }), jsxs(Detail.Metadata, { children: [jsx(Detail.Metadata.Link, { label: "Homepage", href: formula.homepage, children: formula.homepage }), jsx(Detail.Metadata.Value, { label: "Version", children: formula.versions.stable }), jsx(Detail.Metadata.Value, { label: "License", children: formula.license ?? "None" }), jsx(Detail.Metadata.Value, { label: "Generated Date", children: formula.generated_date }), jsx(Detail.Metadata.Value, { label: "Installation Status", children: isInstalled
                            ? isOutdated
                                ? "Installed (Update Available)"
                                : "Installed"
                            : "Not Installed" })] })] }));
}
function CaskDetailView(props) {
    const { cask, isInstalled: initialIsInstalled, isOutdated: initialIsOutdated, } = props;
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
    return (jsxs(Detail, { isLoading: isInstalling || isUpgrading || isUninstalling, actions: jsxs(ActionPanel, { children: [!isInstalled && (jsx(Action, { label: "Install Cask", onAction: handleInstall })), isInstalled && isOutdated && (jsx(Action, { label: "Upgrade Cask", onAction: handleUpgrade })), isInstalled && !isOutdated && (jsx(Action, { label: "Check for Updates", onAction: handleUpgrade })), isInstalled && (jsx(Action, { label: "Uninstall Cask", onAction: handleUninstall }))] }), children: [jsxs(Detail.Content, { children: [jsx(Detail.Content.H1, { children: cask.name[0] || cask.token }), jsx(Detail.Content.Paragraph, { children: cask.desc })] }), jsxs(Detail.Metadata, { children: [jsx(Detail.Metadata.Link, { label: "Homepage", href: cask.homepage, children: cask.homepage }), jsx(Detail.Metadata.Value, { label: "Version", children: cask.version }), jsx(Detail.Metadata.Value, { label: "Installation Status", children: isInstalled
                            ? isOutdated
                                ? "Installed (Update Available)"
                                : "Installed"
                            : "Not Installed" })] })] }));
}
function SearchListView() {
    const [searchText, setSearchText] = useState("");
    const { pushView } = useNavigation();
    const [formulae, setFormulae] = useState([]);
    const [casks, setCasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [installationStatus, setInstallationStatus] = useState(null);
    const [outdatedPackages, setOutdatedPackages] = useState(null);
    const formulaePageSize = 50;
    const casksPageSize = 50;
    useEffect(() => {
        let isMounted = true;
        async function loadData() {
            console.log("Loading data...");
            try {
                const [formulaeData, caskData, installStatus, outdatedStatus] = await Promise.all([
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
            }
            catch (error) {
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
    const isFormulaInstalled = useCallback((name) => {
        return installationStatus?.formulae[name] || false;
    }, [installationStatus]);
    const isCaskInstalled = useCallback((token) => {
        return installationStatus?.casks[token] || false;
    }, [installationStatus]);
    const isFormulaOutdated = useCallback((name) => {
        return outdatedPackages?.formulae.includes(name) || false;
    }, [outdatedPackages]);
    const isCaskOutdated = useCallback((token) => {
        return outdatedPackages?.casks.includes(token) || false;
    }, [outdatedPackages]);
    const onClick = (id) => {
        if (!id)
            return;
        const formula = getFormulaByID(id);
        if (formula) {
            pushView(jsx(FormulaDetailView, { formula: formula, isInstalled: isFormulaInstalled(formula.name), isOutdated: isFormulaOutdated(formula.name) }));
        }
        else {
            const cask = getCaskByID(id);
            if (cask) {
                pushView(jsx(CaskDetailView, { cask: cask, isInstalled: isCaskInstalled(cask.token), isOutdated: isCaskOutdated(cask.token) }));
            }
            else {
                console.log("No match found!");
            }
        }
    };
    // Filter packages by search text
    const filteredFormulae = useMemo(() => {
        return formulae.filter((formula) => formula.name.toLowerCase().includes(searchText?.toLowerCase() ?? ""));
    }, [formulae, searchText]);
    const filteredCasks = useMemo(() => {
        return casks.filter((cask) => cask.token.toLowerCase().includes(searchText?.toLowerCase() ?? ""));
    }, [casks, searchText]);
    const displayedFormulae = filteredFormulae.slice(0, formulaePageSize);
    const displayedCasks = filteredCasks.slice(0, casksPageSize);
    // Render badges for installation and update status
    const getFormulaAccessories = (name) => {
        const accessories = [];
        if (isFormulaInstalled(name)) {
            accessories.push(jsx(IconAccessory, { icon: Icons.Checkmark, tooltip: "Installed" }, `installed-${name}`));
            if (isFormulaOutdated(name)) {
                accessories.push(jsx(IconAccessory, { icon: Icons.ArrowClockwise, tooltip: "Update Available" }, `update-${name}`));
            }
        }
        return accessories;
    };
    const getCaskAccessories = (token) => {
        const accessories = [];
        if (isCaskInstalled(token)) {
            accessories.push(jsx(IconAccessory, { icon: Icons.Checkmark, tooltip: "Installed" }, `installed-${token}`));
            if (isCaskOutdated(token)) {
                accessories.push(jsx(IconAccessory, { icon: Icons.ArrowClockwise, tooltip: "Update Available" }, `update-${token}`));
            }
        }
        return accessories;
    };
    return (jsxs(List, { isLoading: isLoading, actions: jsx(ActionPanel, { children: jsx(Action, { label: "Show Details", onAction: onClick }) }), children: [jsx(List.SearchBar, { placeholder: "Search formulae or casks...", value: searchText, onChange: setSearchText }), jsx(List.Section, { title: "Formulae", children: displayedFormulae.map((formula) => (jsx(List.Section.Item, { title: formula.name, subtitle: formula.desc, id: formula.name, accessories: getFormulaAccessories(formula.name) }, formula.name))) }), jsx(List.Section, { title: "Casks", children: displayedCasks.map((cask) => (jsx(List.Section.Item, { title: cask.name[0] || cask.token, subtitle: cask.desc, id: cask.token, accessories: getCaskAccessories(cask.token) }, cask.token))) })] }));
    function getFormulaByID(id) {
        return formulae.find((formula) => formula.name === id);
    }
    function getCaskByID(id) {
        return casks.find((cask) => cask.token === id);
    }
}

export { SearchListView as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmpzIiwic291cmNlcyI6W10sInNvdXJjZXNDb250ZW50IjpbXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsifQ==
