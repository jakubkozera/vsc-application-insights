import React from 'react';
import styles from './Button.module.css';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'icon';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  title,
  type = 'button'
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      type={type}
    >
      {children}
    </button>
  );
};
