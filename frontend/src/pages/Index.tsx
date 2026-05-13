import {
  CheckCircle2,
  FileCheck,
  FileSearch,
  GraduationCap,
  Shield,
  UserCheck,
  Zap,
} from "lucide-react";

const trustPillars = [
  {
    icon: FileSearch,
    title: "Verify in minutes",
    description:
      "Reviewers can check a certificate by ID or PDF without asking the institution again.",
    tone: "text-blockchain-primary bg-blockchain-primary/10",
  },
  {
    icon: Shield,
    title: "Keep records clean",
    description:
      "Issued certificates stay organized in one place with clear student and course details.",
    tone: "text-blockchain-secondary bg-blockchain-secondary/10",
  },
  {
    icon: UserCheck,
    title: "Control issuing",
    description:
      "Admins manage certificate creation through a protected dashboard.",
    tone: "text-blockchain-accent bg-blockchain-accent/15",
  },
];

const audienceItems = [
  "Institutions issue certificates with a consistent workflow.",
  "Students can share credentials with confidence.",
  "Recruiters and reviewers see clear verification results.",
  "Admins keep the certificate list clean and current.",
];

const proofFlow = [
  { icon: GraduationCap, label: "Enter student details" },
  { icon: FileCheck, label: "Issue certificate" },
  { icon: Shield, label: "Save secure record" },
  { icon: FileSearch, label: "Verify anytime" },
];

const Index = () => {
  return (
    <div className="min-h-screen">
      <section className="border-b border-border/70">
        <div className="container mx-auto grid gap-10 px-4 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:py-12">
          <div className="flex flex-col justify-start">
            <p className="section-kicker mb-4">Blockchain Certificate System</p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight text-foreground md:text-6xl">
              Secure academic certificates,{" "}
              <span className="brand-text">ready to verify</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              BlockCert helps institutions issue certificates and lets students,
              recruiters, and reviewers confirm authenticity with confidence.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="stat-chip">
                <Shield className="h-4 w-4 text-primary" />
                Secure records
              </div>
              <div className="stat-chip">
                <GraduationCap className="h-4 w-4 text-accent" />
                Academic ready
              </div>
              <div className="stat-chip">
                <CheckCircle2 className="h-4 w-4 text-blockchain-success" />
                Easy verification
              </div>
            </div>
          </div>

          <div className="surface-card flex flex-col justify-between rounded-lg p-6 md:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
              <div>
                <p className="section-kicker mb-2">Certificate Portal</p>
                <h2 className="text-2xl font-semibold text-card-foreground">
                  How it works
                </h2>
              </div>
              <div className="brand-gradient rounded-lg p-3 shadow-[var(--glow-primary)]">
                <GraduationCap className="h-8 w-8 text-white" />
              </div>
            </div>

            <div className="my-8 space-y-4">
              {proofFlow.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-4 rounded-lg border border-border bg-background/70 p-4"
                  >
                    <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-md text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        Step {index + 1}
                      </p>
                      <p className="font-medium text-foreground">{item.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
              <p className="text-sm font-medium text-primary">
                Authentic records only
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every certificate shown in BlockCert comes from verified
                records, giving reviewers a clean and trusted result.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/35">
        <div className="container mx-auto grid gap-8 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="surface-card rounded-lg p-6 md:p-8">
            <p className="section-kicker mb-4">Certificate Trust Center</p>
            <h2 className="text-3xl font-bold leading-tight text-foreground md:text-5xl">
              Clear issuing. Confident verification.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              BlockCert keeps the certificate journey simple: create a record,
              share it with the student, and let anyone verify it from a clean
              public page.
            </p>

            <div className="mt-8 grid gap-3">
              {audienceItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-md border border-border bg-background/55 p-3 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {trustPillars.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-lg border border-border bg-background/70 p-5 shadow-[var(--shadow-card)] transition-colors hover:border-primary/45"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${feature.tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-3">
                        <span className="text-xs font-semibold text-secondary">
                          0{index + 1}
                        </span>
                        <h3 className="text-2xl font-semibold text-foreground">
                          {feature.title}
                        </h3>
                      </div>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="rounded-lg border border-secondary/35 bg-secondary/10 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary/15 text-secondary">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Designed for live certificate work
                  </h3>
                  <p className="mt-1 text-muted-foreground">
                    The interface focuses on real records, readable results, and
                    simple actions for admins and reviewers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
