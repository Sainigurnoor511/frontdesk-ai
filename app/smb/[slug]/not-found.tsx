export default function BookingPageNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">Booking page not found</h1>
      <p className="text-sm text-muted-foreground">
        This link may be incorrect, or the business hasn&apos;t enabled online booking.
      </p>
    </div>
  )
}
