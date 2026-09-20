'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import styles from '../login/page.module.css';

export default function RegisterPage() {
    const t = useTranslations('Auth');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            if (res.ok) {
                // Success, automatically route them to the home page via hard reload to clear cache
                window.location.href = '/';
            } else {
                const data = await res.json();
                setError(data.message || t('registerFailed'));
            }
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit} className={styles.form}>
                <h1 className={styles.title}>{t('registerTitle')}</h1>
                <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-neutral)' }}>
                    {t('registerIntro')}
                </p>
                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.group}>
                    <label htmlFor="name">{t('name')}</label>
                    <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className={styles.input}
                    />
                </div>

                <div className={styles.group}>
                    <label htmlFor="email">{t('email')}</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={styles.input}
                    />
                </div>

                <div className={styles.group}>
                    <label htmlFor="password">{t('password')}</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className={styles.input}
                    />
                </div>

                <button type="submit" className="btn" style={{ width: '100%' }} disabled={isLoading}>
                    {isLoading ? t('creatingAccount') : t('submitRegister')}
                </button>

                <div style={{ marginTop: 'var(--space-md)', textAlign: 'center', fontSize: '0.875rem' }}>
                    {t('haveAccount')}{' '}
                    <Link href="/login" style={{ textDecoration: 'underline' }}>
                        {t('loginLink')}
                    </Link>
                </div>
            </form>
        </div>
    );
}
