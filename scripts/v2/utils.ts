import { z } from "zod";

export function toAsyncResult<T, TError = Error>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: TError }> {
  return promise
    .then((value) => ({ ok: true as const, value }))
    .catch((error) => ({ ok: false as const, error }));
}

export function toResult<T>(
  cb: () => T,
): { ok: true; value: T } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: cb() };
  } catch (error) {
    return { ok: false, error };
  }
}

export const ContractInfo = z.object({
  abi: z.array(z.object({ name: z.string() })),
  evm: z.object({
    bytecode: z.object({
      object: z.string(),
    }),
    deployedBytecode: z.object({}),
  }),
  metadata: z.string(),
});
export const BuildInfo = z.object({
  output: z.object({
    contracts: z.record(z.string(), z.record(z.string(), ContractInfo)),
  }),
});
