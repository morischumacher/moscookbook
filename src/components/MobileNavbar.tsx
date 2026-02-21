'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import LogoutButton from './LogoutButton';

interface MobileNavbarProps {
    tHome: string;
    tLogin: string;
    tAdmin: string;
    user: { id: number; email: string; name: string; admin: boolean } | null;
    locale: string;
    otherLocale: string;
}

export default function MobileNavbar({
    tHome,
    tLogin,
    tAdmin,
    user,
    locale,
    otherLocale,
}: MobileNavbarProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <nav className="bg-[#FFF8F0] dark:bg-black border-b border-gray-200 dark:border-gray-800 py-4 sticky top-0 z-[100]">
            <div className="container mx-auto px-4 md:px-8 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center hover:opacity-70 transition-opacity">
                    <Image
                        src="/logo.png"
                        alt="mo'scookbook Logo"
                        width={288}
                        height={48}
                        className="object-contain h-12 w-auto"
                        priority
                    />
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-baseline gap-8">
                    {!user ? (
                        <Link href="/login" className="text-sm text-gray-900 dark:text-white hover:opacity-50 transition-opacity">
                            {tLogin}
                        </Link>
                    ) : (
                        <div className="flex items-center gap-8">
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                Hello {user.name}
                            </span>
                            {user.admin && (
                                <div className="flex gap-8">
                                    <Link href="/admin" className="text-sm text-gray-900 dark:text-white hover:opacity-50 transition-opacity">
                                        {tAdmin}
                                    </Link>
                                    <Link href="/admin/users" className="text-sm text-gray-900 dark:text-white hover:opacity-50 transition-opacity">
                                        Users
                                    </Link>
                                </div>
                            )}
                            <LogoutButton className="text-sm text-gray-900 dark:text-white hover:opacity-50 transition-opacity" />
                        </div>
                    )}
                    <Link href="/" locale={otherLocale} className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        {otherLocale.toUpperCase()}
                    </Link>
                </div>

                {/* Mobile Hamburger Icon */}
                <button
                    className="md:hidden flex flex-col items-center justify-center gap-1.5 w-10 h-10"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label="Toggle menu"
                >
                    <span className={`block w-6 h-0.5 bg-black dark:bg-white transition-opacity ${isOpen ? 'opacity-50' : ''}`}></span>
                    <span className={`block w-6 h-0.5 bg-black dark:bg-white transition-opacity ${isOpen ? 'opacity-50' : ''}`}></span>
                    <span className={`block w-6 h-0.5 bg-black dark:bg-white transition-opacity ${isOpen ? 'opacity-50' : ''}`}></span>
                </button>
            </div>

            {/* Mobile Menu Overlay */}
            {isOpen && (
                <div className="md:hidden absolute top-[73px] left-0 w-full bg-[#FFF8F0] dark:bg-black border-b border-gray-200 dark:border-gray-800 shadow-lg px-4 py-6 flex flex-col gap-6">
                    {!user ? (
                        <Link href="/login" className="text-base font-medium text-gray-900 dark:text-white" onClick={() => setIsOpen(false)}>
                            {tLogin}
                        </Link>
                    ) : (
                        <>
                            <span className="text-base font-medium text-blue-600 dark:text-blue-400">
                                Hello {user.name}
                            </span>
                            {user.admin && (
                                <>
                                    <Link href="/admin" className="text-base font-medium text-gray-900 dark:text-white" onClick={() => setIsOpen(false)}>
                                        {tAdmin}
                                    </Link>
                                    <Link href="/admin/users" className="text-base font-medium text-gray-900 dark:text-white" onClick={() => setIsOpen(false)}>
                                        Users
                                    </Link>
                                </>
                            )}
                            <LogoutButton className="text-base font-medium text-gray-900 dark:text-white" />
                        </>
                    )}
                    <div className="w-full h-px bg-gray-200 dark:bg-gray-800 my-2"></div>
                    <Link href="/" locale={otherLocale} className="text-base font-bold text-gray-500" onClick={() => setIsOpen(false)}>
                        Language: {otherLocale.toUpperCase()}
                    </Link>
                </div>
            )}
        </nav>
    );
}
