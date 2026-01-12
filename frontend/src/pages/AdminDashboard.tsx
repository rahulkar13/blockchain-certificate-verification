import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  FileCheck,
  Search,
  Plus,
  LogOut,
  Loader2,
  Eye,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/hooks/use-toast";

// ✅ match backend Certificate model
interface Certificate {
  certificateId: string;
  studentName: string;
  courseName: string;
  issueDate: string;
  ipfsPdfHash: string;
  blockchainTx: string;
  issuedBy: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [adminUser, setAdminUser] = useState<{ name: string; email: string } | null>(null);

  const API_BASE = "http://localhost:5000";
  const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

  // 🧩 Load admin + recent certs
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
      toast({
        title: "Unauthorized",
        description: "Please log in to access the dashboard.",
        variant: "destructive",
      });
      navigate("/admin/login");
      return;
    }

    const savedUser = localStorage.getItem("adminUser");
    if (savedUser) {
      try {
        setAdminUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("adminUser");
      }
    }

    (async () => {
      try {
        await fetchAdminProfile(token);
        await fetchRecentCertificates(token);
      } catch (err) {
        console.error("Dashboard load error:", err);
      }
    })();
  }, [navigate]);

  // 👤 Fetch admin profile
  const fetchAdminProfile = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        localStorage.clear();
        navigate("/admin/login");
        throw new Error("Unauthorized");
      }

      if (res.ok) {
        const data = await res.json();
        const user = { name: data.name || "Admin", email: data.email || "" };
        setAdminUser(user);
        localStorage.setItem("adminUser", JSON.stringify(user));
      }
    } catch (err) {
      console.error("fetchAdminProfile error:", err);
    }
  };

  // 📜 Fetch last 10 issued certs
  const fetchRecentCertificates = async (token?: string) => {
    setIsLoading(true);
    try {
      const authToken = token ?? localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE}/api/issue/recent`, {
        headers: {
          Authorization: `Bearer ${authToken ?? ""}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to fetch certificates");
      const payload = await res.json();
      const certs = payload?.certificates ?? [];

      setCertificates(
        certs.map((cert: any) => ({
          certificateId: cert.certificateId,
          studentName: cert.studentName,
          courseName: cert.courseName,
          issueDate: cert.issueDate,
          ipfsPdfHash: cert.ipfsPdfHash,
          blockchainTx: cert.blockchainTx,
          issuedBy: cert.issuedBy,
        }))
      );
    } catch (err) {
      console.error("Error fetching certificates:", err);
      toast({
        title: "Failed to load certificates",
        description: "Showing demo data instead.",
        variant: "destructive",
      });
      setCertificates([
        {
          certificateId: "CERT-2024-001",
          studentName: "Demo Student",
          courseName: "Blockchain Fundamentals",
          issueDate: "2024-03-15",
          ipfsPdfHash: "",
          blockchainTx: "",
          issuedBy: "Admin",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    toast({ title: "Logged out successfully" });
    navigate("/admin/login");
  };

  // 🧾 View PDF from IPFS
  const handleViewPDF = (ipfsHash: string) => {
    if (!ipfsHash) {
      toast({
        title: "No PDF available",
        description: "This certificate has no linked IPFS file.",
        variant: "destructive",
      });
      return;
    }
    window.open(`${IPFS_GATEWAY}${ipfsHash}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
                {adminUser ? (
                  <p className="text-sm text-muted-foreground">
                    {adminUser.name} ({adminUser.email})
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading admin...</p>
                )}
              </div>
            </div>

            {/* <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            </div> */}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 gap-4">
            <Button
              onClick={() => navigate("/issue")}
              className="h-24 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
            >
              <Plus className="mr-2 h-5 w-5" /> Issue New Certificate
            </Button>
            <Button onClick={() => navigate("/verify")} variant="outline" className="h-24">
              <Search className="mr-2 h-5 w-5" /> Verify Certificate
            </Button>
          </div>

          {/* Certificates Table */}
          <Card className="border-border shadow-[var(--shadow-card)]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-card-foreground">
                    <FileCheck className="h-5 w-5 text-accent" />
                    Recent Certificates
                  </CardTitle>
                  <CardDescription>Last 10 issued certificates</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchRecentCertificates()}>
                  Refresh
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : certificates.length === 0 ? (
                <div className="text-center py-12">
                  <FileCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">No certificates issued yet</p>
                  <Button onClick={() => navigate("/issue")} className="mt-4" variant="outline">
                    Issue Your First Certificate
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certificate ID</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Course Name</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Issued By</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((cert) => (
                        <TableRow key={cert.certificateId}>
                          <TableCell className="font-mono text-sm">{cert.certificateId}</TableCell>
                          <TableCell>{cert.studentName}</TableCell>
                          <TableCell>{cert.courseName}</TableCell>
                          <TableCell>{new Date(cert.issueDate).toLocaleDateString()}</TableCell>
                          <TableCell>{cert.issuedBy}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewPDF(cert.ipfsPdfHash)}
                              className="flex items-center gap-1"
                            >
                              <Eye className="h-4 w-4" /> View PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
