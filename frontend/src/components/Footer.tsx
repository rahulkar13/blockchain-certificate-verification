import { Link } from "react-router-dom";
import {
  BadgeCheck,
  FileSearch,
  GraduationCap,
  Shield,
  Sparkles,
} from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border/70 bg-background/95 px-4 py-8">
      <div className="container mx-auto overflow-hidden rounded-lg border border-border bg-card/80 shadow-[var(--shadow-card)]">
        <div className="brand-gradient h-1.5" />

        <div className="grid gap-8 p-6 md:grid-cols-[1.25fr_0.75fr_0.9fr] md:p-8">
          <div>
            <Link to="/" className="mb-5 flex w-fit items-center gap-3">
              <div className="brand-gradient rounded-lg p-2.5 shadow-[var(--glow-primary)]">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="block text-xl font-bold text-foreground">
                  BlockCert
                </span>
                <span className="text-xs font-semibold uppercase text-primary">
                  Certificate Verification
                </span>
              </div>
            </Link>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Issue academic certificates, keep records organized, and help
              reviewers confirm credentials with confidence.
            </p>
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold text-foreground">Quick Links</p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <Link
                to="/verify"
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <FileSearch className="h-4 w-4" />
                Verify Certificate
              </Link>
              <Link
                to="/admin/login"
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <Shield className="h-4 w-4" />
                Admin Login
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-4 text-sm font-semibold text-foreground">System Focus</p>
            <div className="grid gap-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/65 px-3 py-2 text-sm text-muted-foreground">
                <BadgeCheck className="h-4 w-4 text-primary" />
                Verified certificate records
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/65 px-3 py-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-secondary" />
                Clean admin workflow
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-6 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>© 2026 BlockCert. Certificate verification made simple.</p>
          <p>Secure issuing. Clear verification.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
