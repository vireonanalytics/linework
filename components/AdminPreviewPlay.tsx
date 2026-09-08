import { DrawTheLine } from "@/components/DrawTheLine";
import type { Dataset } from "@/lib/types/dataset";

/**
 * A chart played in admin preview: fully playable, never recorded.
 *
 * This component exists for one reason - to be the ONLY place in the codebase
 * that passes `record={false}`. Set inline on the page instead, the flag would
 * be one careless edit away from disappearing, and the symptom of losing it is
 * silent: preview plays would simply start landing in the aggregates, looking
 * exactly like real answers, with nothing on screen to say so. Same class of
 * failure as a question that quietly reveals its own answer.
 *
 * The "not recorded" banner deliberately sits OUTSIDE the chart card, above
 * it, so a screen recording cropped to the card is clean - this route is also
 * where chart videos get made.
 */
export function AdminPreviewPlay({ dataset }: { dataset: Dataset }) {
  return (
    <div className="stack-3">
      <p className="admin-preview-banner">
        Preview. Nothing you draw here is recorded, scored into this chart&apos;s
        statistics, or counted toward a streak.
      </p>
      <DrawTheLine dataset={dataset} record={false} barLabel="Admin preview" />
    </div>
  );
}
