import React from 'react';
import styles from './LoadingOverlay.module.css';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.spinner} />
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
};
