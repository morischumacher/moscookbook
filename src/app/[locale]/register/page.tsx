'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/routing';
import styles from '../login/page.module.css';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (res.ok) {
                // Success, automatically route them to the home page via hard reload to clear cache
                window.location.href = '/';
            } else {
                const data = await res.json();
                setError(data.message || 'Registration failed');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit} className={styles.form}>
                <h1 className={styles.title}>Register</h1>
                <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-neutral)' }}>
                    Create an account to save favorite recipes and leave ratings.
                </p>
                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.group}>
                    <label htmlFor="email">Email</label>
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
                    <label htmlFor="password">Password</label>
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
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                </button>

                <div style={{ marginTop: 'var(--space-md)', textAlign: 'center', fontSize: '0.875rem' }}>
                    Already have an account? <Link href="/login" style={{ textDecoration: 'underline' }}>Log In</Link>
                </div>
            </form>
        </div>
    );
}
