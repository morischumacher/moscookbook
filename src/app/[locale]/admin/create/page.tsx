'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import styles from './page.module.css';

interface IngredientRow {
    amount: string;
    item: string;
}

export default function CreateRecipePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [nationality, setNationality] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [instructions, setInstructions] = useState('');
    const [uploading, setUploading] = useState(false);

    const [ingredients, setIngredients] = useState<IngredientRow[]>([{ amount: '', item: '' }]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.url) {
                setImageUrl(data.url);
            } else {
                setError('Upload failed');
            }
        } catch (err) {
            setError('Upload error');
        } finally {
            setUploading(false);
        }
    };

    const handleSlugGen = () => {
        if (!slug && title) {
            setSlug(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        }
    };

    const addIngredient = () => {
        setIngredients([...ingredients, { amount: '', item: '' }]);
    };

    const updateIngredient = (index: number, field: keyof IngredientRow, value: string) => {
        const newIngredients = [...ingredients];
        newIngredients[index][field] = value;
        setIngredients(newIngredients);
    };

    const removeIngredient = (index: number) => {
        const newIngredients = ingredients.filter((_, i) => i !== index);
        setIngredients(newIngredients);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    slug,
                    description,
                    category,
                    nationality,
                    imageUrl,
                    instructions,
                    ingredients: ingredients.filter(i => i.item.trim() !== '')
                })
            });

            if (res.ok) {
                router.push('/admin');
                router.refresh();
            } else {
                const data = await res.json();
                setError(data.message || 'Failed to create recipe');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`container ${styles.container}`}>
            <h1 className={styles.title}>Create New Recipe</h1>

            {error && <div className={styles.error}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label>Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={handleSlugGen}
                        required
                        className={styles.input}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Slug</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        required
                        className={styles.input}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Description</label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className={styles.textarea}
                        rows={3}
                    />
                </div>

                <div className={styles.row}>
                    <div className={styles.formGroup}>
                        <label>Category</label>
                        <input
                            type="text"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            list="categories"
                            className={styles.input}
                        />
                        <datalist id="categories">
                            <option value="Breakfast" />
                            <option value="Lunch" />
                            <option value="Dinner" />
                            <option value="Dessert" />
                        </datalist>
                    </div>

                    <div className={styles.formGroup}>
                        <label>Nationality</label>
                        <input
                            type="text"
                            value={nationality}
                            onChange={e => setNationality(e.target.value)}
                            list="nationalities"
                            className={styles.input}
                        />
                        <datalist id="nationalities">
                            <option value="Italian" />
                            <option value="German" />
                            <option value="Asian" />
                            <option value="Mexican" />
                        </datalist>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Image Upload</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className={styles.input}
                        disabled={uploading}
                    />
                    {uploading && <p>Uploading...</p>}
                    {imageUrl && (
                        <div style={{ marginTop: '1rem' }}>
                            <p>Preview:</p>
                            <img src={imageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: '8px' }} />
                            <input type="hidden" value={imageUrl} />
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <label className={styles.sectionLabel}>Ingredients</label>
                    {ingredients.map((ing, idx) => (
                        <div key={idx} className={styles.ingredientRow}>
                            <input
                                type="text"
                                placeholder="Amount (e.g. 200g)"
                                value={ing.amount}
                                onChange={e => updateIngredient(idx, 'amount', e.target.value)}
                                className={styles.input}
                                style={{ flex: 1 }}
                            />
                            <input
                                type="text"
                                placeholder="Item"
                                value={ing.item}
                                onChange={e => updateIngredient(idx, 'item', e.target.value)}
                                className={styles.input}
                                style={{ flex: 2 }}
                            />
                            <button
                                type="button"
                                onClick={() => removeIngredient(idx)}
                                className={styles.removeBtn}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={addIngredient} className={styles.addBtn}>
                        + Add Ingredient
                    </button>
                </div>

                <div className={styles.formGroup}>
                    <label>Instructions (Markdown)</label>
                    <textarea
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        required
                        className={styles.textarea}
                        rows={15}
                        placeholder="# Instructions..."
                    />
                </div>

                <button type="submit" disabled={loading} className="btn" style={{ width: '100%', marginTop: '1rem' }}>
                    {loading ? 'Creating...' : 'Create Recipe'}
                </button>
            </form>
        </div>
    );
}
