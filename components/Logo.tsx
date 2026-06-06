import Image from "next/image";

interface LogoProps {
  size?: number;
}

export function Logo({ size = 40 }: LogoProps) {
  return <Image src="/logo.svg" width={size} height={size} alt="AD Pulse" priority />;
}
