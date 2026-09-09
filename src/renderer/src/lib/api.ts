export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

declare global {
  interface Window {
    api: { invoke: (canal: string, payload?: unknown) => Promise<ApiResponse<unknown>> };
  }
}

/** Llama a un canal del backend y devuelve los datos, o lanza el error. */
export async function call<T = unknown>(canal: string, payload?: unknown): Promise<T> {
  const res = await window.api.invoke(canal, payload);
  if (!res.ok) throw new Error(res.error || 'Ocurrió un error.');
  return res.data as T;
}
