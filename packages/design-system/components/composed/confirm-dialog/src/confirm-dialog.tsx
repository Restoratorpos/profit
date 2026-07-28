"use client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  type AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import React, {
  type ComponentPropsWithRef,
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface CustomActionsProps {
  cancel: () => void;
  config: ConfirmOptions;
  confirm: () => void;
  isLoading: boolean;
  setConfig: ConfigUpdater;
  setLoading: (loading: boolean) => void;
}

export type ConfigUpdater = (
  config: ConfirmOptions | ((prev: ConfirmOptions) => ConfirmOptions)
) => void;

export type LegacyCustomActions = (
  onConfirm: () => void,
  onCancel: () => void
) => ReactNode;

export type EnhancedCustomActions = (props: CustomActionsProps) => ReactNode;

export interface ConfirmResult {
  close: () => void;
  confirmed: boolean;
}

/**
 * Configuration options for a confirm dialog.
 */
export interface ConfirmOptions {
  alertDialogContent?: ComponentPropsWithRef<typeof AlertDialogContent>;
  alertDialogDescription?: ComponentPropsWithRef<typeof AlertDialogDescription>;
  alertDialogFooter?: ComponentPropsWithRef<typeof AlertDialogFooter>;
  alertDialogHeader?: ComponentPropsWithRef<typeof AlertDialogHeader>;
  /** Props for customizing AlertDialog parts */
  alertDialogOverlay?: ComponentPropsWithRef<typeof AlertDialogOverlay>;
  alertDialogTitle?: ComponentPropsWithRef<typeof AlertDialogTitle>;
  /** Props passed to the cancel button, or null to hide */
  cancelButton?: ComponentPropsWithRef<typeof Button> | null;
  /** Text for the cancel button */
  cancelText?: string;
  /** Props passed to the confirm button */
  confirmButton?: ComponentPropsWithRef<typeof Button>;
  /** Text for the confirm button */
  confirmText?: string;
  /** Custom content inside the dialog */
  contentSlot?: ReactNode;
  /** Custom actions (legacy or enhanced) */
  customActions?: LegacyCustomActions | EnhancedCustomActions;
  /** Optional description under the title */
  description?: ReactNode;
  /** Disable the cancel button while loading */
  disableCancelOnLoading?: boolean;
  /** Optional icon to render next to the title */
  icon?: ReactNode;
  /** Whether the confirm button is in loading state */
  isLoading?: boolean;
  /** Custom loading icon for confirm button */
  loadingIcon?: ReactNode;
  /** Text displayed when confirm is loading */
  loadingText?: string;
  /** Dialog title */
  title?: ReactNode;
}

/**
 * Internal state of the confirm dialog.
 */
export interface ConfirmDialogState {
  /** Current configuration of the dialog */
  config: ConfirmOptions;
  /** Whether the confirm action is loading */
  isLoading: boolean;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Resolver for the promise returned by confirm() */
  resolver: ((value: ConfirmResult) => void) | null;
}

/**
 * Value stored in the ConfirmDialog context.
 */
export interface ConfirmContextValue {
  /** Opens the confirm dialog and returns a promise for the result */
  confirm: ConfirmFunction;
  /** Sets the loading state manually */
  setLoading: (loading: boolean) => void;
  /** Updates the dialog configuration */
  updateConfig: ConfigUpdater;
}

/**
 * The confirm function signature.
 * Returns a promise resolving with the result of the dialog.
 */
export interface ConfirmFunction {
  /** Set the loading state */
  setLoading?: (loading: boolean) => void;
  /** Update the dialog configuration after opening */
  updateConfig?: ConfigUpdater;
  (options: ConfirmOptions): Promise<ConfirmResult>;
}

export const ConfirmContext = createContext<ConfirmContextValue | undefined>(
  undefined
);

const baseDefaultOptions: ConfirmOptions = {
  title: "",
  description: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  loadingText: "Loading...",
  loadingIcon: null,
  disableCancelOnLoading: true,
  confirmButton: {},
  cancelButton: {},
  alertDialogContent: {},
  alertDialogHeader: {},
  alertDialogTitle: {},
  alertDialogDescription: {},
  alertDialogFooter: {},
};

function isLegacyCustomActions(
  fn: LegacyCustomActions | EnhancedCustomActions
): fn is LegacyCustomActions {
  return fn.length === 2;
}

const ConfirmDialogContent = memo(
  ({
    config,
    onConfirm,
    onCancel,
    setConfig,
    isLoading,
    setLoading,
  }: {
    config: ConfirmOptions;
    onConfirm: () => void;
    onCancel: () => void;
    setConfig: (
      config: ConfirmOptions | ((prev: ConfirmOptions) => ConfirmOptions)
    ) => void;
    isLoading: boolean;
    setLoading: (loading: boolean) => void;
  }) => {
    const {
      title,
      description,
      cancelButton,
      confirmButton,
      confirmText,
      cancelText,
      loadingText,
      loadingIcon,
      disableCancelOnLoading,
      icon,
      contentSlot,
      customActions,
      alertDialogContent,
      alertDialogHeader,
      alertDialogTitle,
      alertDialogDescription,
      alertDialogFooter,
    } = config;

    const effectiveLoading = isLoading || config.isLoading;
    const shouldDisableCancel = effectiveLoading && disableCancelOnLoading;

    const renderActions = () => {
      if (!customActions) {
        return (
          <>
            {cancelButton !== null && (
              <Button
                disabled={shouldDisableCancel}
                onClick={onCancel}
                size="sm"
                variant="outline"
                {...cancelButton}
              >
                {cancelText}
              </Button>
            )}
            <Button
              disabled={effectiveLoading}
              onClick={onConfirm}
              size="sm"
              variant="default"
              {...confirmButton}
            >
              {effectiveLoading ? (
                <>
                  {loadingIcon ?? <Spinner />}
                  {loadingText ?? "Loading..."}
                </>
              ) : (
                confirmText
              )}
            </Button>
          </>
        );
      }

      if (isLegacyCustomActions(customActions)) {
        return customActions(onConfirm, onCancel);
      }

      return customActions({
        confirm: onConfirm,
        cancel: onCancel,
        config,
        setConfig,
        isLoading: !!effectiveLoading,
        setLoading,
      });
    };

    const renderTitle = () => {
      if (!(title || icon)) {
        return null;
      }

      return (
        <AlertDialogTitle {...alertDialogTitle}>
          {icon}
          {title}
        </AlertDialogTitle>
      );
    };

    return (
      <AlertDialogPortal>
        {/* <AlertDialogOverlay {...alertDialogOverlay} /> */}
        <AlertDialogContent className="rounded-xl p-0" {...alertDialogContent}>
          <div className="rounded-xl p-4">
            <AlertDialogHeader {...alertDialogHeader}>
              {renderTitle()}
              {description && (
                <AlertDialogDescription
                  {...alertDialogDescription}
                  className="pb-4"
                >
                  {description}
                </AlertDialogDescription>
              )}
              {contentSlot}
            </AlertDialogHeader>
            <AlertDialogFooter {...alertDialogFooter}>
              {renderActions()}
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    );
  }
);

ConfirmDialogContent.displayName = "ConfirmDialogContent";

const ConfirmDialog = memo(
  ({
    isOpen,
    onOpenChange,
    config,
    onConfirm,
    onCancel,
    setConfig,
    isLoading,
    setLoading,
  }: {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    config: ConfirmOptions;
    onConfirm: () => void;
    onCancel: () => void;
    setConfig: (
      config: ConfirmOptions | ((prev: ConfirmOptions) => ConfirmOptions)
    ) => void;
    isLoading: boolean;
    setLoading: (loading: boolean) => void;
  }) => (
    <AlertDialog onOpenChange={onOpenChange} open={isOpen}>
      <ConfirmDialogContent
        config={config}
        isLoading={isLoading}
        onCancel={onCancel}
        onConfirm={onConfirm}
        setConfig={setConfig}
        setLoading={setLoading}
      />
    </AlertDialog>
  )
);

ConfirmDialog.displayName = "ConfirmDialog";

export const ConfirmDialogProvider = ({
  defaultOptions = {},
  children,
}: {
  defaultOptions?: ConfirmOptions;
  children: React.ReactNode;
}) => {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    config: baseDefaultOptions,
    resolver: null,
    isLoading: false,
  });

  const mergedDefaultOptions = useMemo(
    () => ({
      ...baseDefaultOptions,
      ...defaultOptions,
    }),
    [defaultOptions]
  );

  const updateConfig = useCallback(
    (
      newConfig: ConfirmOptions | ((prev: ConfirmOptions) => ConfirmOptions)
    ) => {
      setDialogState((prev) => ({
        ...prev,
        config:
          typeof newConfig === "function"
            ? newConfig(prev.config)
            : { ...prev.config, ...newConfig },
      }));
    },
    []
  );

  const setLoading = useCallback((loading: boolean) => {
    setDialogState((prev) => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState((prev) => ({
      ...prev,
      isOpen: false,
      resolver: null,
      isLoading: false,
    }));
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      setDialogState((prev) => ({
        isOpen: true,
        config: { ...mergedDefaultOptions, ...options },
        resolver: prev.resolver,
        isLoading: false,
      }));
      return new Promise<ConfirmResult>((resolve) => {
        setDialogState((prev) => ({
          ...prev,
          resolver: resolve,
        }));
      });
    },
    [mergedDefaultOptions]
  );

  const handleConfirm = useCallback(() => {
    setDialogState((prev) => {
      if (prev.resolver) {
        prev.resolver({
          confirmed: true,
          close: closeDialog,
        });
      }
      return prev; // Don't close automatically - let user control it
    });
  }, [closeDialog]);

  const handleCancel = useCallback(() => {
    setDialogState((prev) => {
      if (prev.resolver) {
        prev.resolver({
          confirmed: false,
          close: closeDialog,
        });
      }
      return {
        ...prev,
        isOpen: false,
        resolver: null,
        isLoading: false,
      };
    });
  }, [closeDialog]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!(open || dialogState.isLoading)) {
        handleCancel();
      }
    },
    [handleCancel, dialogState.isLoading]
  );

  const contextValue = useMemo(
    () => ({
      confirm,
      updateConfig,
      setLoading,
    }),
    [confirm, updateConfig, setLoading]
  );

  useEffect(() => {
    if (!dialogState.isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogState.isOpen, handleConfirm, handleCancel]);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <ConfirmDialog
        config={dialogState.config}
        isLoading={dialogState.isLoading}
        isOpen={dialogState.isOpen}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        onOpenChange={handleOpenChange}
        setConfig={updateConfig}
        setLoading={setLoading}
      />
    </ConfirmContext.Provider>
  );
};

/**
 * Hook to open a confirm dialog from anywhere in the app.
 *
 * @example
 * ```tsx
 * const confirm = useConfirm();
 *
 * const handleDelete = async () => {
 *   const result = await confirm({
 *     title: "Delete item?",
 *     description: "This action cannot be undone.",
 *     confirmText: "Delete",
 *   });
 *
 *   if (result.confirmed) {
 *     await deleteItem();
 *     result.close(); // close dialog programmatically
 *   }
 * };
 * ```
 */
export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }

  const { confirm, updateConfig, setLoading } = context;

  const enhancedConfirm = confirm;
  enhancedConfirm.updateConfig = updateConfig;
  enhancedConfirm.setLoading = setLoading;

  return enhancedConfirm as ConfirmFunction & {
    updateConfig: ConfirmContextValue["updateConfig"];
    setLoading: ConfirmContextValue["setLoading"];
  };
};
