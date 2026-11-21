
const pool = require('../config/db');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// ======================================================
// 1. CANCEL PASSENGER BOOKING
// ======================================================

async function cancelPassengerBooking(
    req,
    res,
    bookingId,
    helpers
) {
    const { sendJson, authenticatePassenger } = helpers;

    let connection;

    try {
        // 1. Verify passenger authentication
        const decoded = authenticatePassenger(req);

        if (!decoded) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please login before cancelling a booking'
            });
        }

        // 2. Validate booking ID
        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'Invalid booking ID'
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 3. Retrieve the trip ID belonging to this passenger's booking
        const [initialRows] = await connection.execute(
            `SELECT trip_id
             FROM bookings
             WHERE booking_id = ?
               AND user_id = ?`,
            [bookingId, decoded.user_id]
        );

        if (initialRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Booking not found'
            });
        }

        const tripId = initialRows[0].trip_id;

        // 4. Lock the trip first
        const [tripRows] = await connection.execute(
            `SELECT
                trip_id,
                departure_datetime,
                trip_status,
                (departure_datetime > NOW()) AS is_future_trip
             FROM trips
             WHERE trip_id = ?
             FOR UPDATE`,
            [tripId]
        );

        if (tripRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Associated trip not found'
            });
        }

        const trip = tripRows[0];

        // 5. Lock and recheck the booking
        const [bookingRows] = await connection.execute(
            `SELECT
                booking_id,
                booking_reference,
                booking_status,
                trip_id
             FROM bookings
             WHERE booking_id = ?
               AND user_id = ?
               AND trip_id = ?
             FOR UPDATE`,
            [bookingId, decoded.user_id, tripId]
        );

        if (bookingRows.length === 0) {
            await connection.rollback();

            return sendJson(res, 404, {
                success: false,
                message: 'Booking not found'
            });
        }

        const booking = bookingRows[0];

        // 6. Check current booking status
        if (booking.booking_status !== 'confirmed') {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: 'This booking is already cancelled or unavailable'
            });
        }

        // 7. Check departure time using the database clock
        if (
            Number(trip.is_future_trip) !== 1 ||
            trip.trip_status !== 'scheduled'
        ) {
            await connection.rollback();

            return sendJson(res, 400, {
                success: false,
                message: 'This booking can no longer be cancelled'
            });
        }

        // 8. Mark booked seats as cancelled
        const [seatResult] = await connection.execute(
            `UPDATE booking_seats
             SET seat_status = 'cancelled'
             WHERE booking_id = ?
               AND seat_status = 'booked'`,
            [bookingId]
        );

        // 9. Update the booking record
        const [bookingUpdate] = await connection.execute(
            `UPDATE bookings
             SET booking_status = 'cancelled',
                 cancelled_at = NOW()
             WHERE booking_id = ?
               AND user_id = ?
               AND booking_status = 'confirmed'`,
            [bookingId, decoded.user_id]
        );

        if (bookingUpdate.affectedRows !== 1) {
            await connection.rollback();

            return sendJson(res, 409, {
                success: false,
                message: 'Booking could not be cancelled. Please try again.'
            });
        }

        // 10. Mark the associated ticket as cancelled.
        // This happens in the same transaction as the booking cancellation.
        await connection.execute(
            `UPDATE boarding_tickets
             SET ticket_status = 'cancelled'
             WHERE booking_id = ?
               AND ticket_status = 'active'`,
            [bookingId]
        );

        // 11. Commit all cancellation updates together
        await connection.commit();

        return sendJson(res, 200, {
            success: true,
            message: 'Booking cancelled successfully',
            booking: {
                booking_id: booking.booking_id,
                booking_reference: booking.booking_reference,
                booking_status: 'cancelled',
                trip_id: booking.trip_id,
                cancelled_seats: seatResult.affectedRows
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }

        console.error('Booking cancellation error:', error);

        return sendJson(res, 500, {
            success: false,
            message: 'Unable to cancel booking'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}


// ======================================================
// 2. DOWNLOAD PASSENGER PDF TICKET
// ======================================================

async function downloadPassengerTicket(
    req,
    res,
    bookingId,
    helpers
) {
    const { sendJson, authenticatePassenger } = helpers;

    try {
        // 1. Verify passenger authentication
        const decoded = authenticatePassenger(req);

        if (!decoded) {
            return sendJson(res, 401, {
                success: false,
                message: 'Please login to download your ticket'
            });
        }

        // 2. Validate booking ID
        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId <= 0
        ) {
            return sendJson(res, 400, {
                success: false,
                message: 'Invalid booking ID'
            });
        }

        // 3. Retrieve only this passenger's confirmed booking
        //    with an active ticket.
        const [bookingRows] = await pool.execute(
            `SELECT
                b.booking_id,
                b.booking_reference,
                b.booking_status,
                b.number_of_seats,
                b.total_amount,
                b.booked_at,

                u.full_name,

                t.departure_datetime,
                t.arrival_datetime,

                r.route_name,
                r.origin,
                r.destination,

                v.vehicle_model,
                v.registration_number,

                bt.ticket_code,
                bt.ticket_status

             FROM bookings b

             INNER JOIN users u
                ON b.user_id = u.user_id

             INNER JOIN trips t
                ON b.trip_id = t.trip_id

             INNER JOIN routes r
                ON t.route_id = r.route_id

             INNER JOIN vehicles v
                ON t.vehicle_id = v.vehicle_id

             INNER JOIN boarding_tickets bt
                ON b.booking_id = bt.booking_id

             WHERE b.booking_id = ?
               AND b.user_id = ?
               AND b.booking_status = 'confirmed'
               AND bt.ticket_status = 'active'

             LIMIT 1`,
            [bookingId, decoded.user_id]
        );

        if (bookingRows.length === 0) {
            return sendJson(res, 404, {
                success: false,
                message: 'Active ticket not found. It may have been cancelled or does not belong to your account.'
            });
        }

        const booking = bookingRows[0];

        // 4. Retrieve the seats belonging to this booking
        const [seatRows] = await pool.execute(
            `SELECT seat_number
             FROM booking_seats
             WHERE booking_id = ?
               AND seat_status = 'booked'
             ORDER BY seat_number ASC`,
            [bookingId]
        );

        // 5. Generate QR code using the unique ticket code
        const qrBuffer = await QRCode.toBuffer(
            booking.ticket_code,
            {
                type: 'png',
                width: 220,
                margin: 1,
                errorCorrectionLevel: 'M'
            }
        );

        // 6. Prepare PDF response headers
        const safeReference = String(
            booking.booking_reference
        ).replace(/[^a-zA-Z0-9_-]/g, '');

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="ShuttleConnect-${safeReference}.pdf"`
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
            'Access-Control-Expose-Headers',
            'Content-Disposition'
        );

        // 7. Create the PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 45,
                bottom: 45,
                left: 48,
                right: 48
            },
            bufferPages: false
        });

        doc.on('error', (error) => {
            console.error('PDF generation error:', error);

            if (!res.headersSent) {
                sendJson(res, 500, {
                    success: false,
                    message: 'Unable to generate PDF ticket'
                });
            } else {
                res.destroy(error);
            }
        });

        doc.pipe(res);

        // ==================================================
        // PDF DESIGN
        // ==================================================

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        const left = 48;
        const right = pageWidth - 48;

        const yellow = '#F2C400';
        const dark = '#171717';
        const grey = '#666666';
        const lightGrey = '#E5E5E5';

        // Use Times New Roman from Windows when available.
        // PDFKit's built-in Times Roman is the fallback.
        const regularFontPath = 'C:/Windows/Fonts/times.ttf';
        const boldFontPath = 'C:/Windows/Fonts/timesbd.ttf';

        const hasTimesNewRoman = fs.existsSync(regularFontPath);

        if (hasTimesNewRoman) {
            doc.registerFont('TicketTimes', regularFontPath);
        }

        if (fs.existsSync(boldFontPath)) {
            doc.registerFont('TicketTimesBold', boldFontPath);
        }

        const regularFont = hasTimesNewRoman
            ? 'TicketTimes'
            : 'Times-Roman';

        const boldFont = fs.existsSync(boldFontPath)
            ? 'TicketTimesBold'
            : 'Times-Bold';

        // Outer decorative border
        doc
            .lineWidth(1)
            .strokeColor(lightGrey)
            .roundedRect(
                25,
                25,
                pageWidth - 50,
                pageHeight - 50,
                12
            )
            .stroke();

        // Small yellow decorative strip
        doc
            .fillColor(yellow)
            .roundedRect(25, 25, pageWidth - 50, 7, 3)
            .fill();

        // --------------------------------------------------
        // HEADER: SHUTTLECONNECT LEFT + QR RIGHT
        // --------------------------------------------------

        const headerY = 65;

        doc
            .font('Helvetica-Bold')
            .fontSize(25)
            .fillColor(dark)
            .text('Shuttle', left, headerY, {
                continued: true
            });

        doc
            .font('Helvetica-Bold')
            .fontSize(25)
            .fillColor(yellow)
            .text('Connect');

        // QR code at top-right
        const qrSize = 105;
        const qrX = right - qrSize;
        const qrY = 52;

        doc.image(qrBuffer, qrX, qrY, {
            width: qrSize,
            height: qrSize
        });

        doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(grey)
            .text(
                'SCAN YOUR TICKET',
                qrX - 5,
                qrY + qrSize + 5,
                {
                    width: qrSize + 10,
                    align: 'center'
                }
            );

        // Header subtitle
        doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(grey)
            .text(
                'YOUR JOURNEY, MADE SIMPLE',
                left,
                headerY + 35
            );

        // --------------------------------------------------
        // HEADER DIVIDER
        // --------------------------------------------------

        const dividerY = 185;

        doc
            .moveTo(left, dividerY)
            .lineTo(right, dividerY)
            .lineWidth(1.3)
            .strokeColor(yellow)
            .stroke();

        // --------------------------------------------------
        // BOOKING DETAILS
        // --------------------------------------------------

        let currentY = dividerY + 32;

        doc
            .font(regularFont)
            .fontSize(21)
            .fillColor(dark)
            .text('Booking Details', left, currentY);

        currentY += 42;

        const details = [
            {
                label: 'Booking ID',
                value: booking.booking_reference
            },
            {
                label: 'Total Passengers',
                value: String(booking.number_of_seats)
            },
            {
                label: 'Origin',
                value: booking.origin
            },
            {
                label: 'Destination',
                value: booking.destination
            },
            {
                label: 'Total Fare',
                value: `Rs. ${Number(booking.total_amount).toFixed(2)}`
            }
        ];

        for (const detail of details) {
            // Detail label
            doc
                .font(regularFont)
                .fontSize(13)
                .fillColor(grey)
                .text(detail.label, left, currentY, {
                    width: 180
                });

            // Detail value
            doc
                .font(boldFont)
                .fontSize(14)
                .fillColor(dark)
                .text(
                    detail.value || '—',
                    left + 190,
                    currentY,
                    {
                        width: right - left - 190
                    }
                );

            currentY += 48;

            // Subtle row separator
            doc
                .moveTo(left, currentY - 13)
                .lineTo(right, currentY - 13)
                .lineWidth(0.5)
                .strokeColor(lightGrey)
                .stroke();
        }

        // --------------------------------------------------
        // FOOTER DECORATION
        // --------------------------------------------------

        const footerY = pageHeight - 115;

        doc
            .moveTo(left, footerY)
            .lineTo(right, footerY)
            .lineWidth(1)
            .strokeColor(yellow)
            .stroke();

        doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(dark)
            .text(
                'THANK YOU FOR CHOOSING SHUTTLECONNECT',
                left,
                footerY + 18,
                {
                    width: right - left,
                    align: 'center'
                }
            );

        doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(grey)
            .text(
                'Please keep this ticket available for your journey.',
                left,
                footerY + 37,
                {
                    width: right - left,
                    align: 'center'
                }
            );

        // End PDF stream
        doc.end();

    } catch (error) {
        console.error('Ticket download error:', error);

        if (!res.headersSent) {
            return sendJson(res, 500, {
                success: false,
                message: 'Unable to generate or download your ticket'
            });
        }

        res.destroy(error);
    }
}


// ======================================================
// EXPORT CONTROLLERS
// ======================================================

module.exports = {
    cancelPassengerBooking,
    downloadPassengerTicket
};
