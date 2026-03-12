import { runInsightPipeline } from "@/lib/insight/pipeline";
import type { PipelineEvent, PipelineModelSettings } from "@/lib/insight/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  rawJson?: string;
  modelSettings?: PipelineModelSettings;
};

function toSsePayload(event: PipelineEvent | { type: "error"; message: string }) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.rawJson?.trim()) {
    return Response.json({ error: "rawJson is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          await runInsightPipeline(body.rawJson ?? "", {
            modelSettings: body.modelSettings,
            onEvent: (event) => controller.enqueue(encoder.encode(toSsePayload(event))),
          });
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              toSsePayload({
                type: "error",
                message: error instanceof Error ? error.message : "Pipeline execution failed",
              })
            )
          );
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
