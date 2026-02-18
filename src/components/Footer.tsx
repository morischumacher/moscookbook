import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className="container">
                <p>&copy; {new Date().getFullYear()} Mo's Cookbook. All rights reserved.</p>
            </div>
        </footer>
    );
}
