import { Action, ActionPanel, List } from "@project-gauntlet/api/components";
import { Detail } from "@project-gauntlet/api/components";

import { ReactElement, useState, useEffect } from "react";
import { Environment } from "@project-gauntlet/api/helpers";
import { useNavigation } from "@project-gauntlet/api/hooks";

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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

async function fetchCask(): Promise<Cask[]> {
  return fetchWithCache<Cask[]>(
    "https://formulae.brew.sh/api/cask.json",
    "casks.json",
  );
}

function FormulaDetailView(formula: Formula): ReactElement {
  return (
    <Detail>
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
      </Detail.Metadata>
    </Detail>
  );
}

function CaskDetailView(cask: Cask): ReactElement {
  return (
    <Detail>
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
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const onClick = (id: string | undefined) => {
    if (!id) return;

    const formula = getFormulaByID(id);
    if (formula) {
      pushView(<FormulaDetailView {...formula} />);
    } else {
      const cask = getCaskByID(id);
      if (cask) {
        pushView(<CaskDetailView {...cask} />);
      } else {
        console.log("No match found!");
      }
    }
  };

  const filteredFormulae = formulae.filter((formula) =>
    formula.name.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
  );

  const filteredCasks = casks.filter((cask) =>
    cask.token.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
  );

  const displayedFormulae = filteredFormulae.slice(0, formulaePageSize);
  const displayedCasks = filteredCasks.slice(0, casksPageSize);

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
      {displayedFormulae.map((formula) => (
        <List.Section.Item
          key={formula.name}
          title={formula.name}
          subtitle={formula.desc}
          id={formula.name}
        />
      ))}
      {displayedCasks.map((cask) => (
        <List.Section.Item
          key={cask.token}
          title={cask.name[0] || cask.token}
          subtitle={cask.desc}
          id={cask.token}
        />
      ))}
    </List>
  );

  function getFormulaByID(id: string): Formula | undefined {
    return formulae.find((formula) => formula.name === id);
  }

  function getCaskByID(id: string): Cask | undefined {
    return casks.find((cask) => cask.token === id);
  }
}
