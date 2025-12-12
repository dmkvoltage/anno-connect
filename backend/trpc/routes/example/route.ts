import { z } from "zod";
import { publicProcedure } from "../../create-context";

const inputSchema = z.object({ name: z.string() });

export default publicProcedure
  .input(inputSchema)
  .mutation(({ input }: { input: z.infer<typeof inputSchema> }) => {
    return {
      hello: input.name,
      date: new Date(),
    };
  });
