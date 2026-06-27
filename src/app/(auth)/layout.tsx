import { BrandMark } from "@/components/brand";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 py-12">
      <BrandMark />
      {children}
    </div>
  );
}
