"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localhost } from "~~/scaffold.config";
import {
  Bars3Icon,
  BugAntIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  PhotoIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

// 1. 修改：缩短了文案，将 "IPFS Upload/Download" 改为 "Upload/Download"
export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "My NFTs",
    href: "/myNFTs",
    icon: <PhotoIcon className="h-4 w-4" />,
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    icon: <ShoppingBagIcon className="h-4 w-4" />,
  },
    {
    label: "Blind Auctions",
    href: "/blind-auctions",
    icon: <ArrowPathIcon className="h-4 w-4" />,   
  },
  {
    label: "Airdrop",
    href: "/airdrop",
    icon: <ArrowDownTrayIcon className="h-4 w-4" />,
  },

  {
    label: "Transfers",
    href: "/transfers",
    icon: <ArrowPathIcon className="h-4 w-4" />,
  },
  {
    label: "Upload", // 原: IPFS Upload
    href: "/ipfsUpload",
    icon: <ArrowUpTrayIcon className="h-4 w-4" />,
  },
  {
    label: "Download", // 原: IPFS Download
    href: "/ipfsDownload",
    icon: <ArrowDownTrayIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === localhost.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 flex-shrink-0 justify-between z-20 shadow-md shadow-secondary px-2 sm:px-4">
      <div className="navbar-start w-auto flex-grow mr-2">
        <details className="dropdown" ref={burgerMenuRef}>
          <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
            {/* 移动端菜单保留 Debug 选项 */}
            <li>
                <Link href="/debug" className="flex gap-2">
                    <BugAntIcon className="h-4 w-4" /> <span>Debug Contracts</span>
                </Link>
            </li>
          </ul>
        </details>
        
        {/* 2. 修改：减小 Logo 右侧的边距 (mr-6 -> mr-4) */}
        <Link href="/" passHref className="hidden lg:flex items-center gap-2 ml-4 mr-4 shrink-0">
          <div className="flex relative w-10 h-10">
            <Image alt="SE2 logo" className="cursor-pointer" fill src="/logo.svg" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight">SRE Challenges</span>
            <span className="text-xs">Simple NFT Example</span>
          </div>
        </Link>
        
        {/* 3. 修改：减小菜单项之间的间距 (gap-2 -> gap-1) */}
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-1">
          <HeaderMenuLinks />
        </ul>
      </div>

      {/* 4. 修改：减小右侧区域整体间距 (gap-4 -> gap-2) */}
      <div className="navbar-end flex items-center gap-2 flex-shrink-0 w-auto">
        
        {/* 桌面端 Debug 链接 - 独立显示 */}
        <Link 
            href="/debug" 
            className="hidden lg:flex items-center gap-1 text-sm font-medium mr-2 text-gray-500 hover:text-primary transition-colors"
        >
            <BugAntIcon className="h-4 w-4" />
            <span>Debug</span>
        </Link>

        {/* 垂直分割线 */}
        <div className="hidden lg:block h-6 w-px bg-gray-300 mx-1"></div>

        {/* 钱包连接按钮 */}
        <RainbowKitCustomConnectButton />

        {/* 胶囊化 Localhost/Faucet 按钮 */}
        {isLocalNetwork && (
            <div className="flex items-center bg-green-100 dark:bg-green-900/30 rounded-full px-1 py-1">
                 <FaucetButton />
            </div>
        )}
      </div>
    </div>
  );
};