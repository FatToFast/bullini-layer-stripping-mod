"use client";

import dynamic from "next/dynamic";

type SearchProviderOption = {
  kind: string;
  label: string;
  configured: boolean;
};

type SampleItem = {
  key: string;
  label: string;
  rawJson: string;
};

type Props = {
  defaultModel: string;
  providerLabel: string;
  searchProviders: SearchProviderOption[];
  defaultSystemPrompt: string;
  samples: SampleItem[];
};

const InsightWorkbench = dynamic(
  () => import("@/components/insight-workbench").then((module) => module.InsightWorkbench),
  {
    ssr: false,
    loading: () => (
      <main className="shell">
        <section className="hero">
          <div className="heroCard">
            <span className="kicker">Standalone Localhost App</span>
            <h1 className="heroTitle">Layer-Stripping Workbench</h1>
            <p className="heroText">워크벤치 초기 번들을 불러오는 중입니다.</p>
          </div>
        </section>
      </main>
    ),
  },
);

export function InsightWorkbenchShell(props: Props) {
  return <InsightWorkbench {...props} />;
}
