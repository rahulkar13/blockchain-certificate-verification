import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck, Shield, GraduationCap, Hash, ExternalLink, Database, Zap } from "lucide-react";


const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-blockchain-primary/20 via-transparent to-blockchain-secondary/20"></div>
        <div className="container mx-auto text-center relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-gradient-to-r from-blockchain-primary to-blockchain-secondary">
                <GraduationCap className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-blockchain-primary to-blockchain-secondary bg-clip-text text-transparent">
                Blockchain Certificate System
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Secure, verifiable, and tamper-proof academic certificates powered by blockchain technology. 
              Issue and verify certificates with complete transparency and trust.
            </p>
            {/* <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-gradient-to-r from-blockchain-primary to-blockchain-secondary hover:opacity-90 text-white">
                <Link to="/issue" className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Issue Certificate
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/verify" className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Verify Certificate
                </Link>
              </Button>
            </div> */}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose <span className="text-blockchain-primary">BlockCert</span>?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our blockchain-based solution ensures that academic certificates are secure, 
              verifiable, and accessible worldwide.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-primary/10">
                  <Hash className="h-6 w-6 text-blockchain-primary" />
                </div>
                <CardTitle>Cryptographic Security</CardTitle>
                <CardDescription>
                  Each certificate is secured with SHA-256 hashing and stored immutably on the blockchain
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Tamper-proof certificate records</li>
                  <li>• Cryptographic verification</li>
                  <li>• Immutable blockchain storage</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-secondary/10">
                  <ExternalLink className="h-6 w-6 text-blockchain-secondary" />
                </div>
                <CardTitle>IPFS Integration</CardTitle>
                <CardDescription>
                  Certificate files are stored on IPFS for decentralized and permanent access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Decentralized file storage</li>
                  <li>• Global accessibility</li>
                  <li>• Redundant data protection</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-accent/10">
                  <Database className="h-6 w-6 text-blockchain-accent" />
                </div>
                <CardTitle>Smart Contracts</CardTitle>
                <CardDescription>
                  Automated verification and issuance through secure smart contract technology
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Automated processes</li>
                  <li>• No intermediaries needed</li>
                  <li>• Transparent operations</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-warning/10">
                  <Zap className="h-6 w-6 text-blockchain-warning" />
                </div>
                <CardTitle>Instant Verification</CardTitle>
                <CardDescription>
                  Verify any certificate in seconds with our fast blockchain lookup system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Real-time verification</li>
                  <li>• QR code support</li>
                  <li>• Mobile-friendly interface</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-success/10">
                  <Shield className="h-6 w-6 text-blockchain-success" />
                </div>
                <CardTitle>Privacy Protected</CardTitle>
                <CardDescription>
                  Only essential data is stored on-chain while maintaining student privacy
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• GDPR compliant</li>
                  <li>• Minimal data exposure</li>
                  <li>• Secure by design</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-blockchain-primary/30 transition-colors">
              <CardHeader>
                <div className="p-2 w-fit rounded-lg bg-blockchain-primary/10">
                  <GraduationCap className="h-6 w-6 text-blockchain-primary" />
                </div>
                <CardTitle>Academic Focus</CardTitle>
                <CardDescription>
                  Designed specifically for educational institutions and academic credentials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Course completion tracking</li>
                  <li>• Institution verification</li>
                  <li>• Academic standards compliance</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Index;

