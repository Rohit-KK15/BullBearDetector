"use client";

import type { RegimeScore } from "@bull-bear/shared";
import Link from "next/link";
import { MiniDirectionBars } from "./mini-direction-bars";
import { RegimeBadge } from "./regime-badge";
import { ScoreDisplay } from "./score-display";

const glowClass = {
	bull: "card-glow-bull hover:border-bull/30",
	bear: "card-glow-bear hover:border-bear/30",
	neutral: "card-glow-neutral hover:border-neutral/30",
} as const;

const icons: Record<string, string> = {
	BTC: "₿",
	ETH: "Ξ",
	SOL: "◎",
};

function formatPrice(price: number): string {
	if (price === 0) return "—";
	if (price >= 1000)
		return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	if (price >= 1) return `$${price.toFixed(2)}`;
	return `$${price.toFixed(4)}`;
}

export function AssetCard({
	regime,
	index,
}: {
	regime: RegimeScore;
	index: number;
}) {
	return (
		<Link href={`/asset/${regime.asset.toLowerCase()}`}>
			<div
				className={`
        opacity-0 animate-slide-up stagger-${index + 1}
        group relative bg-surface-1 border border-subtle/20 rounded-2xl p-6
        transition-all duration-300 hover:bg-surface-2 hover:-translate-y-1
        ${glowClass[regime.label]}
      `}
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<span className="text-2xl opacity-40 font-mono">
							{icons[regime.asset] ?? "#"}
						</span>
						<div>
							<h2 className="text-xl font-display font-semibold text-white tracking-tight">
								{regime.asset}
							</h2>
							<span className="text-sm font-mono text-white/50 tabular-nums">
								{formatPrice(regime.price)}
							</span>
						</div>
					</div>
					<RegimeBadge label={regime.label} size="sm" />
				</div>

				{/* Score */}
				<div className="mb-5">
					<ScoreDisplay score={regime.score} label={regime.label} size="lg" />
				</div>

				{/* Direction mini bars */}
				<MiniDirectionBars direction={regime.direction} />

				{/* Hover arrow */}
				<div className="absolute top-6 right-6 opacity-0 group-hover:opacity-40 transition-opacity text-muted">
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M3 13L13 3M13 3H5M13 3V11"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</div>
		</Link>
	);
}
