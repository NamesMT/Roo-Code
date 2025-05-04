import React, { useState } from "react"
import { VSCodeButton, VSCodeTextField, VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { MarketplaceItem } from "../../../../src/services/marketplace/types"
import { RocketConfig } from "config-rocket" // Import RocketConfig type

interface MarketplaceInstallSidebarProps {
	item: MarketplaceItem | null
	config: RocketConfig
	isVisible?: boolean
	onClose?: () => void
	onSubmit?: (item: MarketplaceItem, parameters: Record<string, any>) => void
}

const InstallSidebar: React.FC<MarketplaceInstallSidebarProps> = ({ item, config, isVisible, onClose, onSubmit }) => {
	const [userParameters, setUserParameters] = useState<Record<string, any>>({})
	if (!isVisible || !item) return null

	const handleParameterChange = (name: string, value: any) => {
		setUserParameters({
			...userParameters,
			[name]: value,
		})
	}

	const handleSubmit = () => {
		if (onSubmit && item) {
			onSubmit(item, userParameters)
		}
	}

	return (
		<div
			className="fixed inset-0 flex justify-end bg-black/50 z-50"
			onClick={onClose} // Close sidebar when clicking outside
		>
			<div
				className="flex flex-col p-4 bg-vscode-sideBar-background text-vscode-foreground h-full w-3/4 shadow-lg" // Adjust width and add shadow
				onClick={(e) => e.stopPropagation()}>
				<h2 className="text-xl font-bold mb-4">Install {item.name}</h2>
				<div className="flex-grow overflow-y-auto space-y-4">
					{config.parameters?.map((param) => {
						const paramName = param.id
						const resolver = param.resolver

						// Only render prompt parameters that have a defined value (either user input or derived)
						if (resolver.operation === "prompt") {
							const paramValue =
								userParameters[paramName] !== undefined ? userParameters[paramName] : resolver.initial
							if (paramValue === undefined) {
								// If no user input and no initial value, don't render
								return null
							}

							return (
								<div key={paramName} className="flex flex-col">
									<label htmlFor={paramName} className="text-sm font-semibold mb-1">
										{resolver.label || paramName}{" "}
										{/* Use label from resolver if available, otherwise name */}
									</label>
									{/* Render input based on resolver.type */}
									{resolver.type === "text" && (
										<VSCodeTextField
											id={paramName}
											value={
												userParameters[paramName] !== undefined
													? userParameters[paramName]
													: resolver.initial || ""
											}
											onChange={(e) =>
												handleParameterChange(paramName, (e.target as HTMLInputElement).value)
											}
											className="w-full"></VSCodeTextField>
									)}
									{resolver.type === "confirm" && (
										<VSCodeCheckbox
											id={paramName}
											checked={
												userParameters[paramName] !== undefined
													? userParameters[paramName]
													: resolver.initial || false
											}
											onChange={(e) =>
												handleParameterChange(paramName, (e.target as HTMLInputElement).checked)
											}></VSCodeCheckbox>
									)}
								</div>
							)
						}

						return null
					})}
				</div>
				<div className="flex gap-2 mt-4">
					<VSCodeButton onClick={handleSubmit} className="flex-1">
						Install
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={onClose} className="flex-1">
						Cancel
					</VSCodeButton>
				</div>
			</div>
		</div>
	)
}

export default InstallSidebar
