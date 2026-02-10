import type {
  RoutePolicy,
  HttpMethod,
  PaymentAccept,
  PaymentRequirements,
  EndpointSchema,
} from "./types.js";

// ---------------------------------------------------------------------------
// PolicyEngine — register route policies, match incoming requests, and
// generate x402-compliant payment requirements.
// ---------------------------------------------------------------------------

export class PolicyEngine {
  private policies: RoutePolicy[] = [];

  /** Register one or more route policies. */
  add(...items: RoutePolicy[]): this {
    this.policies.push(...items);
    return this;
  }

  /** Find the policy that matches a given path + method. */
  match(path: string, method: string): RoutePolicy | undefined {
    const upper = method.toUpperCase() as HttpMethod;
    return this.policies.find(
      (p) => p.path === path && p.method === upper,
    );
  }

  /** Return all registered policies (defensive copy). */
  all(): readonly RoutePolicy[] {
    return [...this.policies];
  }

  /** Check whether a path lives behind the /proxy prefix. */
  isProxy(path: string): boolean {
    return path.startsWith("/proxy/");
  }

  // ── x402 helpers ──────────────────────────────────────────────────

  /** Build a PaymentAccept block from a policy + the inbound request URL. */
  toAccept(policy: RoutePolicy, resource: string): PaymentAccept {
    return {
      scheme: policy.scheme,
      network: policy.network,
      maxAmountRequired: policy.maxAmountRequired,
      resource,
      description: policy.description,
      mimeType: policy.mimeType,
      payTo: policy.payTo,
      maxTimeoutSeconds: policy.maxTimeoutSeconds,
      asset: policy.asset,
      ...(policy.extra ? { extra: policy.extra } : {}),
    };
  }

  /** Build the full 402 body from a single accept entry. */
  toRequirements(accept: PaymentAccept): PaymentRequirements {
    return { x402Version: 2, accepts: [accept] };
  }
}

// ---------------------------------------------------------------------------
// Fluent policy builder
// ---------------------------------------------------------------------------

export class PolicyBuilder {
  private p: Partial<RoutePolicy> & { path: string };

  constructor(path: string) {
    this.p = {
      path,
      scheme: "exact",
      mimeType: "application/json",
      maxTimeoutSeconds: 60,
    };
  }

  get(): this     { this.p.method = "GET";    return this; }
  post(): this    { this.p.method = "POST";   return this; }
  put(): this     { this.p.method = "PUT";    return this; }
  delete(): this  { this.p.method = "DELETE"; return this; }
  patch(): this   { this.p.method = "PATCH";  return this; }

  method(m: HttpMethod): this {
    this.p.method = m;
    return this;
  }

  costs(amount: string, asset: string): this {
    this.p.maxAmountRequired = amount;
    this.p.asset = asset;
    return this;
  }

  on(network: string): this {
    this.p.network = network;
    return this;
  }

  payTo(addr: string): this {
    this.p.payTo = addr;
    return this;
  }

  describe(desc: string): this {
    this.p.description = desc;
    return this;
  }

  mime(type: string): this {
    this.p.mimeType = type;
    return this;
  }

  timeout(seconds: number): this {
    this.p.maxTimeoutSeconds = seconds;
    return this;
  }

  scheme(s: string): this {
    this.p.scheme = s;
    return this;
  }

  extra(e: Record<string, unknown>): this {
    this.p.extra = e;
    return this;
  }

  /** Attach an I/O schema for x402scan discovery. */
  ioSchema(schema: EndpointSchema): this {
    this.p.outputSchema = schema;
    return this;
  }

  build(): RoutePolicy {
    const { method, network, asset, maxAmountRequired, payTo, description } = this.p;
    if (!method) throw new Error("PolicyBuilder: method is required");
    if (!network) throw new Error("PolicyBuilder: network is required (.on())");
    if (!asset || !maxAmountRequired) throw new Error("PolicyBuilder: cost is required (.costs())");
    if (!payTo) throw new Error("PolicyBuilder: payTo is required");
    if (!description) throw new Error("PolicyBuilder: description is required (.describe())");
    return this.p as RoutePolicy;
  }
}

/** Shorthand entry point: `policy("/path").get().costs(...)...build()` */
export function policy(path: string): PolicyBuilder {
  return new PolicyBuilder(path);
}
