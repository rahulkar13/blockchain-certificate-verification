import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Hash,
  History,
  Loader2,
  Search,
  Shield,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getApiBaseUrl } from "@/utils/api";
import { toast } from "@/hooks/use-toast";

interface ActivityLog {
  _id: string;
  action: string;
  certificateId?: string;
  studentEmail?: string;
  actor: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

const parseDateValue = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateButtonLabel = (value: string, fallback: string) => {
  const date = parseDateValue(value);
  return date ? format(date, "dd MMM yyyy") : fallback;
};

const AdminAuditTrail: React.FC = () => {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem("adminToken"), []);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState<
    "from" | "to" | null
  >(null);

  useEffect(() => {
    if (!token) {
      navigate("/admin/login");
      return;
    }

    fetchLogs(1, token);
  }, [navigate, token]);

  const authHeaders = (authToken?: string) => ({
    Authorization: `Bearer ${authToken ?? token ?? ""}`,
  });

  const buildQuery = (pageToLoad: number) => {
    const params = new URLSearchParams({
      page: String(pageToLoad),
      limit: "10",
    });
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  };

  const fetchLogs = async (pageToLoad = page, authToken?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/issue/activity/logs?${buildQuery(pageToLoad)}`,
        { headers: authHeaders(authToken) }
      );
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 403) {
          navigate("/super-admin/dashboard");
          return;
        }
        throw new Error(payload.message || "Audit logs could not be loaded.");
      }

      setLogs(payload.logs || []);
      setPage(payload.page || pageToLoad);
      setTotalPages(payload.totalPages || 1);
      setTotal(payload.total || 0);
    } catch (error: any) {
      toast({
        title: "Audit trail failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setFromDate("");
    setToDate("");
    window.setTimeout(() => fetchLogs(1), 0);
  };

  const renderDateField = (
    picker: "from" | "to",
    value: string,
    onChange: (value: string) => void,
    label: string
  ) => (
    <Popover
      open={datePickerOpen === picker}
      onOpenChange={(open) => setDatePickerOpen(open ? picker : null)}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-14 w-full justify-start gap-3 border-primary/25 bg-card/80 text-left text-base font-normal hover:border-primary/60 hover:bg-primary/10 ${
            value ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 truncate">
            {formatDateButtonLabel(value, label)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto border-primary/25 bg-popover/95 p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDateValue(value)}
          onSelect={(date) => {
            onChange(date ? toDateValue(date) : "");
            setDatePickerOpen(null);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <main className="container mx-auto px-4 py-10">
      <section className="mb-6 border-b border-border/70 pb-6">
        <div className="section-kicker mb-3 flex items-center gap-2">
          <History className="h-4 w-4" />
          Audit Trail
        </div>
        <h1 className="text-4xl font-bold text-foreground">Admin action history</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Review issue, edit, revoke, email, wallet, and transaction events for your admin account.
        </p>
      </section>

      <Card className="surface-card mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Search Audit Logs
          </CardTitle>
          <CardDescription>
            Filter by date, action, certificate ID, student email, or message text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search action, ID, email, wallet, transaction..."
              onKeyDown={(event) => {
                if (event.key === "Enter") fetchLogs(1);
              }}
            />
            {renderDateField("from", fromDate, setFromDate, "Starting Date")}
            {renderDateField("to", toDate, setToDate, "Ending Date")}
            <Button onClick={() => fetchLogs(1)}>Apply</Button>
            <Button variant="outline" className="bg-card/80" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardHeader>
          <CardTitle>{total} audit event(s)</CardTitle>
          <CardDescription>10 events per page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background/55 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading audit trail...
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit logs found.</p>
          ) : (
            logs.map((log) => (
              <article
                key={log._id}
                className="rounded-md border border-border bg-background/55 p-4"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="font-semibold capitalize text-foreground">
                      {log.action.replace(/_/g, " ")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{log.message}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <AuditDetail icon={<Hash />} label="Certificate" value={log.certificateId || "System"} />
                  <AuditDetail icon={<Shield />} label="Actor" value={log.actor || "Admin"} />
                  <AuditDetail
                    icon={<Wallet />}
                    label="Transaction / Wallet"
                    value={
                      String(log.details?.blockchainTx || log.details?.revokeTx || log.details?.issuerWalletAddress || "Not recorded")
                    }
                  />
                </div>
              </article>
            ))
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="bg-card/80"
              disabled={page <= 1 || isLoading}
              onClick={() => fetchLogs(page - 1)}
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button
              variant="outline"
              className="bg-card/80"
              disabled={page >= totalPages || isLoading}
              onClick={() => fetchLogs(page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

const AuditDetail = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="rounded-md border border-border bg-card/60 p-3 text-sm">
    <div className="mb-1 flex items-center gap-2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-primary">
      {icon}
      {label}
    </div>
    <p className="break-all font-medium text-foreground">{value}</p>
  </div>
);

export default AdminAuditTrail;
