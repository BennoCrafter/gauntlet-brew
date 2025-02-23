import {
  Action,
  ActionPanel,
  IconAccessory,
  Icons,
  List,
  TextAccessory,
} from "@project-gauntlet/api/components";
import { Detail } from "@project-gauntlet/api/components";

import { ReactElement, useState, useEffect } from "react";
import { Environment } from "@project-gauntlet/api/helpers";
import {
  useEntrypointPreferences,
  useNavigation,
  usePluginPreferences,
} from "@project-gauntlet/api/hooks";

function FormulaDetailView(formula: Formula): ReactElement {
  const { popView } = useNavigation();

  return (
    <Detail>
      <Detail.Content>
        <Detail.Content.H1>{formula.name}</Detail.Content.H1>
        <Detail.Content.Paragraph>{formula.desc}</Detail.Content.Paragraph>
      </Detail.Content>
      <Detail.Metadata>
        <Detail.Metadata.Link label={"Homepage"} href={formula.homepage}>
          {formula.homepage}
        </Detail.Metadata.Link>
        <Detail.Metadata.Value label={"Version"}>
          {formula.versions.stable}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label={"License"}>
          {formula.license ?? "None"}
        </Detail.Metadata.Value>
        <Detail.Metadata.Value label={"Generated Date"}>
          {formula.generated_date}
        </Detail.Metadata.Value>
      </Detail.Metadata>
    </Detail>
  );
}

function CaskDetailView(cask: Cask): ReactElement {
  const { popView } = useNavigation();

  useEffect(() => {
    return () => {
      console.log("TestView useEffect destructor called");
    };
  }, []);

  return (
    <Detail>
      <Detail.Content>
        <Detail.Content.H1>{cask.name[0] || cask.token}</Detail.Content.H1>
        <Detail.Content.Paragraph>{cask.desc}</Detail.Content.Paragraph>
      </Detail.Content>
      <Detail.Metadata>
        <Detail.Metadata.Link label={"Homepage"} href={cask.homepage}>
          {cask.homepage}
        </Detail.Metadata.Link>
        <Detail.Metadata.Value label={"Version"}>
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
  const [formulaePage, setFormulaePage] = useState<number>(0);
  const [casksPage, setCasksPage] = useState<number>(0);
  const formulaePageSize = 50;
  const casksPageSize = 50;

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      console.log("Fetching data...");
      const formulaeData = await fetchFormulae(
        "https://formulae.brew.sh/api/formula.json",
      );
      const caskData = await fetchCask(
        "https://formulae.brew.sh/api/cask.json",
      );
      if (isMounted) {
        setFormulae(formulaeData);
        setCasks(caskData);
        setIsLoading(false);
        console.log("Data fetching complete.");
      }
    }
    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const onClick = (id: string | undefined) => {
    console.log("onClick " + id);
    if (!id) return;

    const pck = getPackageByID(id);
    const formula = getForumlaByID(id);
    if (formula) {
      pushView(<FormulaDetailView {...formula} />);
    } else {
      const cask = getCaskByID(id);
      if (cask) {
        pushView(<CaskDetailView {...cask} />);
      } else {
        console.log("No match found!");
        // todo: some error indication
        return;
      }
    }
  };
  const filteredFormulae = formulae.filter((formula) =>
    formula.name.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
  );

  const filteredCasks = casks.filter((cask) =>
    cask.token.toLowerCase().includes(searchText?.toLowerCase() ?? ""),
  );

  const displayedFormulae = filteredFormulae.slice(
    0,
    (formulaePage + 1) * formulaePageSize,
  );
  const displayedCasks = filteredCasks.slice(
    0,
    (casksPage + 1) * casksPageSize,
  );

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
        placeholder={"Search formulae or casks..."}
        value={searchText}
        onChange={setSearchText}
      />
      {displayedFormulae.map((formula) => {
        return (
          <List.Section.Item
            key={formula.name}
            title={formula.name}
            subtitle={formula.desc}
            id={formula.name}
          />
        );
      })}
      {displayedCasks.map((cask) => {
        return (
          <List.Section.Item
            key={cask.token}
            title={cask.name[0] || cask.token}
            subtitle={cask.desc}
            id={cask.token}
          />
        );
      })}
    </List>
  );

  function getForumlaByID(id: string): Formula | undefined {
    return formulae.find((formula) => formula.name === id);
  }

  function getCaskByID(id: string): Cask | undefined {
    return casks.find((cask) => cask.token === id);
  }

  function getPackageByID(id: string): Formula | Cask | undefined {
    return getForumlaByID(id) || getCaskByID(id);
  }
}

async function fetchFormulae(url: string): Promise<Formula[]> {
  const response = await fetch(url);
  const data = await response.json();
  return data as Formula[];
}

async function fetchCask(url: string): Promise<Cask[]> {
  const response = await fetch(url);
  const data = await response.json();
  return data as Cask[];
}
