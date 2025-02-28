import { jsxs, jsx } from 'react/jsx-runtime';
import { List, ActionPanel, Action, Detail } from '@project-gauntlet/api/components';
import { useState, useEffect } from 'react';
import { Environment } from '@project-gauntlet/api/helpers';
import { useNavigation } from '@project-gauntlet/api/hooks';

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
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
async function fetchCask() {
    return fetchWithCache("https://formulae.brew.sh/api/cask.json", "casks.json");
}
function FormulaDetailView(formula) {
    return (jsxs(Detail, { children: [jsxs(Detail.Content, { children: [jsx(Detail.Content.H1, { children: formula.name }), jsx(Detail.Content.Paragraph, { children: formula.desc })] }), jsxs(Detail.Metadata, { children: [jsx(Detail.Metadata.Link, { label: "Homepage", href: formula.homepage, children: formula.homepage }), jsx(Detail.Metadata.Value, { label: "Version", children: formula.versions.stable }), jsx(Detail.Metadata.Value, { label: "License", children: formula.license ?? "None" }), jsx(Detail.Metadata.Value, { label: "Generated Date", children: formula.generated_date })] })] }));
}
function CaskDetailView(cask) {
    return (jsxs(Detail, { children: [jsxs(Detail.Content, { children: [jsx(Detail.Content.H1, { children: cask.name[0] || cask.token }), jsx(Detail.Content.Paragraph, { children: cask.desc })] }), jsxs(Detail.Metadata, { children: [jsx(Detail.Metadata.Link, { label: "Homepage", href: cask.homepage, children: cask.homepage }), jsx(Detail.Metadata.Value, { label: "Version", children: cask.version })] })] }));
}
function SearchListView() {
    const [searchText, setSearchText] = useState("");
    const { pushView } = useNavigation();
    const [formulae, setFormulae] = useState([]);
    const [casks, setCasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const formulaePageSize = 50;
    const casksPageSize = 50;
    useEffect(() => {
        let isMounted = true;
        async function loadData() {
            console.log("Loading data...");
            try {
                const [formulaeData, caskData] = await Promise.all([
                    fetchFormulae(),
                    fetchCask(),
                ]);
                if (isMounted) {
                    setFormulae(formulaeData);
                    setCasks(caskData);
                    setIsLoading(false);
                    console.log("Data loading complete.");
                }
            }
            catch (error) {
                console.error("Failed to load data:", error);
            }
        }
        loadData();
        return () => {
            isMounted = false;
        };
    }, []);
    const onClick = (id) => {
        if (!id)
            return;
        const formula = getFormulaByID(id);
        if (formula) {
            pushView(jsx(FormulaDetailView, { ...formula }));
        }
        else {
            const cask = getCaskByID(id);
            if (cask) {
                pushView(jsx(CaskDetailView, { ...cask }));
            }
            else {
                console.log("No match found!");
            }
        }
    };
    const filteredFormulae = formulae.filter((formula) => formula.name.toLowerCase().includes(searchText?.toLowerCase() ?? ""));
    const filteredCasks = casks.filter((cask) => cask.token.toLowerCase().includes(searchText?.toLowerCase() ?? ""));
    const displayedFormulae = filteredFormulae.slice(0, formulaePageSize);
    const displayedCasks = filteredCasks.slice(0, casksPageSize);
    return (jsxs(List, { isLoading: isLoading, actions: jsx(ActionPanel, { children: jsx(Action, { label: "Show Details", onAction: onClick }) }), children: [jsx(List.SearchBar, { placeholder: "Search formulae or casks...", value: searchText, onChange: setSearchText }), displayedFormulae.map((formula) => (jsx(List.Section.Item, { title: formula.name, subtitle: formula.desc, id: formula.name }, formula.name))), displayedCasks.map((cask) => (jsx(List.Section.Item, { title: cask.name[0] || cask.token, subtitle: cask.desc, id: cask.token }, cask.token)))] }));
    function getFormulaByID(id) {
        return formulae.find((formula) => formula.name === id);
    }
    function getCaskByID(id) {
        return casks.find((cask) => cask.token === id);
    }
}

export { SearchListView as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmpzIiwic291cmNlcyI6W10sInNvdXJjZXNDb250ZW50IjpbXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsifQ==
