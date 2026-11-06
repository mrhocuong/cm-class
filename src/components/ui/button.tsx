import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "success";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default:
        "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 shadow-sm",
      secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400",
      outline:
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400",
      ghost:
        "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
      destructive:
        "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm",
      success:
        "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 shadow-sm",
    };

    const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 text-xs",
      lg: "h-11 px-6 text-base",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
