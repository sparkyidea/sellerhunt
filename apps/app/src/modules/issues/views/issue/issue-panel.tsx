"use client";

import { SelectProperty } from "@sparkyidea/dataview/properties";
import {
  PanelClose,
  PanelContent,
  PanelExpand,
  PanelGroup,
  PanelHeader,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import { IssueNotesSection } from "../../components/issue-notes-section";
import { IssueOrderSection } from "../../components/issue-order-section";
import { IssueSummarySection } from "../../components/issue-summary-section";
import {
  ISSUE_RESOLUTION_OPTIONS,
  ISSUE_STATUS_OPTIONS,
  ISSUE_TYPE_OPTIONS,
} from "../../issues-options";
import type { IssueData } from "../../types";

function getIssueTypeLabel(issue: IssueData): string {
  const option = ISSUE_TYPE_OPTIONS.find((o) => o.value === issue.type);
  if (option && typeof option.name === "string") {
    return option.name;
  }
  return issue.type;
}

function getIssueTitle(issue: IssueData): string {
  const typeLabel = getIssueTypeLabel(issue);
  const identifier =
    issue.reference ?? issue.order?.orderNumber ?? issue.order?.reference;
  return identifier ? `${typeLabel} · ${identifier}` : typeLabel;
}

export function IssueDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: issue } = useSuspenseQuery(
    trpc.issue.getOne.queryOptions({ id })
  );

  return (
    <>
      <IssuePageHeader issue={issue} />
      <IssuePanelContent issue={issue} />
    </>
  );
}

export function IssuePreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: issue } = useSuspenseQuery(
    trpc.issue.getOne.queryOptions({ id })
  );

  return (
    <>
      <IssuePreviewHeader issue={issue} onClose={onClose} />
      <IssuePanelContent issue={issue} />
    </>
  );
}

function IssuePageHeader({ issue }: { issue: IssueData }) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={getIssueTitle(issue)} />
        <IssueStatusTags issue={issue} />
      </PanelHeader>
    </PanelGroup>
  );
}

function IssuePreviewHeader({
  issue,
  onClose,
}: {
  issue: IssueData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand render={<Link href={`/issues/${issue.id}` as Route} />} />
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{getIssueTitle(issue)}</PanelTitle>
          <IssueStatusTags issue={issue} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function IssueStatusTags({ issue }: { issue: IssueData }) {
  return (
    <PanelTags>
      <SelectProperty
        config={{ options: ISSUE_TYPE_OPTIONS }}
        value={issue.type}
      />
      <SelectProperty
        config={{ options: ISSUE_STATUS_OPTIONS }}
        value={issue.status}
      />
      {issue.resolution && (
        <SelectProperty
          config={{ options: ISSUE_RESOLUTION_OPTIONS }}
          value={issue.resolution}
        />
      )}
    </PanelTags>
  );
}

function IssuePanelContent({ issue }: { issue: IssueData }) {
  return (
    <PanelContent>
      <div className="@container">
        <div className="grid @3xl:grid-cols-12 grid-cols-1 gap-6">
          <div className="@3xl:col-span-8 flex min-w-0 flex-col gap-4">
            <IssueSummarySection issue={issue} />
            <IssueNotesSection issue={issue} />
          </div>
          <div className="@3xl:col-span-4 flex min-w-0 flex-col gap-4">
            <IssueOrderSection issue={issue} />
          </div>
        </div>
      </div>
    </PanelContent>
  );
}
