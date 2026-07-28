import { useIsomorphicLayoutEffect } from "@repo/design-system/hooks/use-isomorphic-layout-effect";
import * as React from "react";

function useAsRef<T>(props: T) {
  const ref = React.useRef<T>(props);

  useIsomorphicLayoutEffect(() => {
    ref.current = props;
  });

  return ref;
}

export { useAsRef };
