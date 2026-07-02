import { BrandMark } from "@/components/brand";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="console-shell flex min-h-[100dvh] flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        {children}
      </div>
    </div>
  );
}
